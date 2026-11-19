"""导出受限 Delta 为真正的 DOCX / PDF；从不执行或渲染用户 HTML。"""

from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer

from app.schemas import ReportContent

FONT = "QingAnSans"


def register_fonts():
    if FONT not in pdfmetrics.getRegisteredFontNames():
        directory = Path(__file__).resolve().parents[1] / "assets/fonts"
        pdfmetrics.registerFont(TTFont(FONT, str(directory / "QingAnSans-Regular.ttf")))
        pdfmetrics.registerFont(TTFont(FONT + "-Bold", str(directory / "QingAnSans-Bold.ttf")))
        pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=FONT + "-Bold",
                                      italic=FONT, boldItalic=FONT + "-Bold")


def blocks(report: ReportContent):
    """把 Delta 的行内属性和换行属性分开，Word/PDF 共用同一个解释器。"""
    runs = []
    for op in report.ops:
        if not isinstance(op.insert, str):
            if runs:
                yield "text", runs, {}
                runs = []
            yield "pyramid", op.insert.reportPyramid, {}
            continue
        attrs = op.attributes.model_dump(exclude_none=True) if op.attributes else {}
        pieces = op.insert.split("\n")
        for index, piece in enumerate(pieces):
            if piece:
                runs.append((piece, attrs))
            if index < len(pieces) - 1:
                yield "text", runs, attrs
                runs = []
    if runs:
        yield "text", runs, {}


def docx_bytes(report: ReportContent) -> bytes:
    doc = Document()
    sec = doc.sections[0]
    # 跟随用户提供的 A4 报告。
    sec.page_width, sec.page_height = Inches(8.27), Inches(11.69)
    sec.top_margin = sec.bottom_margin = Inches(.7)
    sec.left_margin = sec.right_margin = Inches(.75)
    for name in ("Normal", "Title", "Heading 1", "Heading 2", "Heading 3"):
        style = doc.styles[name]
        style.font.name = "宋体"
        style._element.get_or_add_rPr().rFonts.set(qn("w:eastAsia"), "宋体")
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.font.size = Pt({"Title": 20, "Heading 1": 17, "Heading 2": 14,
                              "Heading 3": 12}.get(name, 11))
        props = style.element.find(qn("w:pPr"))
        if props is not None:
            for border in list(props.findall(qn("w:pBdr"))):
                props.remove(border)
    doc.styles["Normal"].paragraph_format.line_spacing = 1.35
    doc.styles["Normal"].paragraph_format.space_after = Pt(4)
    doc.core_properties.title = report.title
    doc.core_properties.author = ""
    doc.core_properties.last_modified_by = ""
    for kind, runs, attrs in blocks(report):
        if kind == "pyramid":
            for i, tier in enumerate(runs):
                p = doc.add_paragraph()
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                inset = .25 + (len(runs) - i - 1) * .24
                p.paragraph_format.left_indent = p.paragraph_format.right_indent = Inches(inset)
                p.paragraph_format.space_after = Pt(3)
                p.paragraph_format.space_before = Pt(0)
                shading = OxmlElement("w:shd")
                shading.set(qn("w:fill"), tier.color[1:])
                p._p.get_or_add_pPr().append(shading)
                r = p.add_run(f"{tier.label}（{tier.count}）")
                r.bold = True
                r.font.color.rgb = RGBColor(255, 255, 255)
            doc.add_paragraph().paragraph_format.space_after = Pt(0)
            continue
        header = attrs.get("header")
        style = {1: "Title", 2: "Heading 1", 3: "Heading 2"}.get(header, "Normal")
        p = doc.add_paragraph(style=style)
        if header:
            borders = OxmlElement("w:pBdr")
            for side in ("top", "bottom", "left", "right", "between"):
                border = OxmlElement(f"w:{side}")
                border.set(qn("w:val"), "nil")
                borders.append(border)
            p._p.get_or_add_pPr().append(borders)
        p.alignment = {"center": WD_ALIGN_PARAGRAPH.CENTER, "right": WD_ALIGN_PARAGRAPH.RIGHT,
                       "justify": WD_ALIGN_PARAGRAPH.JUSTIFY}.get(attrs.get("align"), WD_ALIGN_PARAGRAPH.LEFT)
        if attrs.get("list"):
            p.style = "List Number" if attrs["list"] == "ordered" else "List Bullet"
        if attrs.get("indent"):
            p.paragraph_format.left_indent = Inches(.25 * attrs["indent"])
        for text, inline in runs:
            r = p.add_run(text)
            r.bold, r.italic = inline.get("bold"), inline.get("italic")
            r.underline, r.font.strike = inline.get("underline"), inline.get("strike")
    footer = sec.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    out = BytesIO()
    doc.save(out)
    return out.getvalue()


class Pyramid(Flowable):
    def __init__(self, tiers, width=440):
        super().__init__()
        self.tiers, self.width, self.height = tiers, width, len(tiers) * 25 + 15
        self.hAlign = "CENTER"

    def draw(self):
        for i, tier in enumerate(self.tiers):
            inset = (len(self.tiers) - i - 1) * 18 + 12
            y = self.height - (i + 1) * 25
            path = self.canv.beginPath()
            path.moveTo(inset + 7, y + 22)
            path.lineTo(self.width - inset - 7, y + 22)
            path.lineTo(self.width - inset, y)
            path.lineTo(inset, y)
            path.close()
            self.canv.setFillColor(colors.HexColor(tier.color))
            self.canv.drawPath(path, fill=1, stroke=0)
            self.canv.setFillColor(colors.white)
            self.canv.setFont(FONT + "-Bold", 10)
            self.canv.drawCentredString(self.width / 2, y + 7, f"{tier.label}（{tier.count}）")


def pdf_bytes(report: ReportContent) -> bytes:
    register_fonts()
    out = BytesIO()
    pdf = SimpleDocTemplate(out, pagesize=A4, leftMargin=48, rightMargin=48,
                            topMargin=42, bottomMargin=42, title=report.title, author="")
    story = []
    ordered = 0
    for kind, runs, attrs in blocks(report):
        if kind == "pyramid":
            story.append(Pyramid(runs))
            ordered = 0
            continue
        header = attrs.get("header", 0)
        style = ParagraphStyle("body", fontName=FONT + "-Bold" if header else FONT, fontSize={1: 20, 2: 15, 3: 12}.get(header, 11),
                               leading={1: 30, 2: 23, 3: 20}.get(header, 18), wordWrap="CJK",
                               alignment={"center": TA_CENTER, "right": TA_RIGHT,
                                          "justify": TA_JUSTIFY}.get(attrs.get("align"), TA_LEFT),
                               spaceBefore=10 if header else 0, spaceAfter=8,
                               leftIndent=attrs.get("indent", 0) * 15,
                               keepWithNext=bool(header))
        text = ""
        for part, inline in runs:
            part = escape(part)
            for key, tag in [("bold", "b"), ("italic", "i"), ("underline", "u"), ("strike", "strike")]:
                if inline.get(key):
                    part = f"<{tag}>{part}</{tag}>"
            text += part
        if attrs.get("list"):
            ordered = ordered + 1 if attrs["list"] == "ordered" else 0
            text = (f"{ordered}. " if ordered else "• ") + text
        else:
            ordered = 0
        story.append(Paragraph(text, style) if text else Spacer(1, 8))

    def footer(canvas, doc):
        canvas.setFont(FONT, 9)
        canvas.drawCentredString(A4[0] / 2, 23, f"第 {doc.page} 页")

    pdf.build(story, onFirstPage=footer, onLaterPages=footer)
    return out.getvalue()
