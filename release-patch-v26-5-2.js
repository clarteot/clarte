(() => {
  const MASTER_BRAND_CATALOG = {"pen":{"Kaweco":["Sport"],"LAMY凌美":["2000","狩猎者Safari"],"Montblanc万宝龙":["大班"],"Parker派克":["IM","世纪","卓尔"],"Pelikan百利金":["Classic","Souveran"],"Pilot百乐":["Capless","Custom","Elite 95S"],"Platinum白金":["3776世纪"],"Sailor写乐":["14K","21K"],"Waterman":["海韵"],"三文堂":["ECO"],"匠心优品":["永生601","英雄616"],"弘典":["1866","620","C1","C2","M2"],"英雄":["100","329","616"],"败家实验室":["日月限定系列"],"辉柏嘉":["如恩"],"里莜":["503云川","505微澜","506雪序","516四季","517遇见奈良","520星月之旅"],"金豪":["1001","59","82"]},"ink":{"J.Herbin":["普色"],"Wearingeul":["普色"],"写乐":["万叶集","区域限定","合作限定","四季织","季节限定"],"弘典":["普色"],"戴阿米":["周年限定","圣诞限定","城市限定","季节限定","普色","联名限定"],"放羊滩":["第一季","第四季","联名限定"],"百乐":["合作限定","色彩雫"],"辉柏嘉":["伯爵"],"里莜":["森林物语","遗忘之海"]},"paper":{"Crena":["Lite","奶油闪电 C","星火纸","星虹纸 R2","星虹纸R2","春罗","白橄纸","雪胧月"],"杉友":["道林纸"],"水上书":["VELAN","乐恩","得鹿春","竹间","荣木","青陆"],"猫头鹰":["光瓜栗"]}};
  const STYLE_PATCH = `<style id="clarte-v2652-brand-patch">
.brand-config-series-chip {
  font-size: 11px !important;
  font-weight: 650 !important;
}
.brand-config-series-chip:has(input:checked) {
  font-weight: 750 !important;
}
</style>`;

  function patchBrandCatalog(appHtml) {
    const startToken = 'const MASTER_BRAND_CATALOG = (()=>{';
    const endToken = '\nfunction setInkSeriesForBrand';
    const start = appHtml.indexOf(startToken);
    const end = appHtml.indexOf(endToken, start);
    if (start < 0 || end < 0) {
      throw new Error('Clarte v26.5.2: brand catalog patch point not found');
    }
    const replacement = 'const MASTER_BRAND_CATALOG = ' + JSON.stringify(MASTER_BRAND_CATALOG) + ';';
    return appHtml.slice(0, start) + replacement + appHtml.slice(end);
  }

  window.CLARTE_RELEASE_PATCH = function(appHtml) {
    let html = patchBrandCatalog(appHtml);
    if (!/<\/head>/i.test(html)) {
      throw new Error('Clarte v26.5.2: document head not found');
    }
    html = html.replace(/<\/head>/i, STYLE_PATCH + '\n</head>');
    return html;
  };

  window.CLARTE_RELEASE_PATCH_VERSION = '26.5.2';
})();
