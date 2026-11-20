import { logo, icon } from '../ui.js';
export const examples = [
  '只有银行转账记录，没有借条，对方主张款项属于赠与，如何审查借贷关系是否成立？',
  '朋友向我借钱，我通过转账给了他，后来他说是我送的，聊天记录里我催过款他回复说会还。',
];
export function homePage() {
  return `<div class="landing refined-home"><header class="landing-header">${logo()}<a href="#/search" class="quiet-link">进入工作区 ${icon('arrow')}</a></header>
    <main class="home-main"><section class="home-intro"><span class="eyebrow">可信类案检索助手</span><h1 tabindex="-1">找到相近的案件，<br>看清裁判的依据。</h1><p>从案情与争点出发，比较相关案例的事实和观点。<br>沿着引用，回到原文核对。</p><a href="#/search" class="btn primary">开始检索 ${icon('arrow')}</a><ol class="home-path"><li><span>01</span> 描述案情</li><li><span>02</span> 比较类案</li><li><span>03</span> 核对原文</li></ol></section>
      <section class="home-examples" aria-labelledby="example-title"><div class="home-example-heading"><h2 id="example-title">从一个具体问题开始</h2><span>民间借贷 · 示例</span></div><div id="scenario-panel"><h3>${examples[0]}</h3><div class="scenario-focus"><span class="mini-label">检索关注点</span><p>款项交付、借贷合意与证明款项性质的证据。</p></div><button type="button" class="quiet-link" data-action="use-example" data-index="0">填入这个问题 ${icon('arrow')}</button></div><div class="home-example-note">可选优化问题，也可以直接检索。</div></section>
    </main><footer class="home-footer"><span>清案 · 可信类案检索助手</span><span>从案情出发，回到原文核对</span></footer></div>`;
}
