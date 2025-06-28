(function(){
  const tabButtons=document.querySelectorAll('.tab');
  const contents=document.querySelectorAll('.tab-content');
  tabButtons.forEach(btn=>btn.addEventListener('click',()=>{
    tabButtons.forEach(b=>b.classList.remove('active'));
    contents.forEach(c=>c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  }));

  /* Export / Import */
  const btnExport=document.getElementById('btn-export');
  const btnImport=document.getElementById('btn-import');
  if(btnExport){btnExport.addEventListener('click',()=>{
    const data={mnems:localStorage.getItem('mnems'),sips:localStorage.getItem('sips')};
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='serverip-settings.json';a.click();URL.revokeObjectURL(url);
  });}
  if(btnImport){btnImport.addEventListener('click',()=>{
    const inp=document.createElement('input');inp.type='file';inp.accept='.json,application/json';
    inp.onchange=e=>{
      const file=e.target.files[0];if(!file)return;const reader=new FileReader();
      reader.onload=ev=>{try{const obj=JSON.parse(ev.target.result);if(obj.mnems){localStorage.setItem('mnems',obj.mnems);} if(obj.sips){localStorage.setItem('sips',obj.sips);} location.reload();}catch(err){alert('Invalid file');}};
      reader.readAsText(file);
    };
    inp.click();
  });}
})();
