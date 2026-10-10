// Reusable DOM components for future declarative clips.
(() => {
  const clean = (v) => String(v ?? '');
  function node(tag, cls, text) {
    const element = document.createElement(tag);
    element.className = cls;
    if (text !== undefined) element.textContent = clean(text);
    return element;
  }
  const base = () => {
    const el = node('div', 'vs-component');
    Object.assign(el.style, { position:'absolute', inset:'0', display:'flex',
      flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontFamily:"'Prompt','Kanit',system-ui,sans-serif", textAlign:'center',
      color:'#fff', padding:'100px', boxSizing:'border-box' });
    return el;
  };
  function titleCard({title,subtitle='',accent='#8b9aff'}={}) {
    const el=base(),h=node('h1','vs-title',title),p=node('p','vs-subtitle',subtitle);
    Object.assign(h.style,{fontSize:'116px',maxWidth:'100%',lineHeight:'1.1',margin:'0 0 30px',color:accent});
    Object.assign(p.style,{fontSize:'48px',maxWidth:'100%',lineHeight:'1.3'});
    el.append(h,p);return el;
  }
  function callout({text,accent='#34d399'}={}) {
    const el=base(),p=node('div','vs-callout',text);
    Object.assign(p.style,{fontSize:'64px',border:'5px solid '+accent,padding:'50px',borderRadius:'34px',
      background:'rgba(0,0,0,.8)',maxWidth:'100%'});
    el.append(p);return el;
  }
  function cta({text,accent='#8b9aff'}={}) {
    const el=base(),p=node('div','vs-cta',text);
    Object.assign(p.style,{fontSize:'80px',fontWeight:800,background:accent,color:'#121624',
      padding:'50px 80px',borderRadius:'100px'});
    el.append(p);return el;
  }
  function counter({value=0,suffix='',accent='#fbbf24'}={}) {
    const el=base(),p=node('span','vs-counter',Number(value).toLocaleString() + clean(suffix));
    Object.assign(p.style,{fontSize:'170px',fontWeight:900,color:accent});
    el.append(p);return el;
  }
  window.VideoComponents = { titleCard, callout, cta, counter };
})();
