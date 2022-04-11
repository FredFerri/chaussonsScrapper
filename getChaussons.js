const puppeteer = require('puppeteer'); 
const xl = require('excel4node');
const nodemailer = require('nodemailer');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const writeInSheet = require('./writeInSheet2');
var numRow = 2;


process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;


module.exports = {

  launch: async function(page, ville, sheet) {
    // await initSheet();
      console.log('LANCEMENT DU SCRAP...');
      console.log(ville);      

      const productKeywords = ['Ciment', 'Chaux', 'Liant'];
 
      await page.setRequestInterception(true);

      const blockedResourceTypes = [
        'image',
        'media',
        'font',
        'texttrack',
        'object',
        'beacon',
        'csp_report',
        'imageset',
      ];

      const skippedResources = [
        'quantserve',
        'adzerk',
        'doubleclick',
        'adition',
        'exelator',
        'sharethrough',
        'cdn.api.twitter',
        'google-analytics',
        'googletagmanager',
        'google',
        'fontawesome',
        'facebook',
        'analytics',
        'optimizely',
        'clicktale',
        'mixpanel',
        'zedo',
        'clicksor',
        'tiqcdn',
      ];      

      page.on('request', request => {
        const requestUrl = request._url.split('?')[0].split('#')[0];
        if (
          blockedResourceTypes.indexOf(request.resourceType()) !== -1 ||
          skippedResources.some(resource => requestUrl.indexOf(resource) !== -1)
        ) {
          request.abort();
        } else {
          request.continue();
        }
      });

      await page.setDefaultNavigationTimeout(0); 
      let pageAgence = await module.exports.changeAgence(page, ville);
      let infosProduits = await module.exports.getInfos(pageAgence);
      let selectedProducts = await module.exports.triProduits(infosProduits, productKeywords, ville);
      return selectedProducts;


  },

  getInfos: async function (page) {
    try {    
        console.log('GET INFOS');
        await page.goto('https://www.chausson-materiaux.fr/articles/3917/gros-oeuvre-et-maconnerie/ciment-chaux-mortier-beton',
          {waitUntil: 'load', timeout: 60000});    

        await page.waitFor('.checkbox-custom-label');
        await page.addScriptTag({path: require.resolve('./jquery')});          
        await module.exports.autoScroll(page);
        await page.waitFor(3000);
        let infos = await page.evaluate(function() {
          let datas = [];
          $('.produit').each(function() {
            let titre = $(this).find('h2.sous-categorie > a').text();
            let marque = $(this).find('.produit-marque').text();
            let prix = $(this).find('.produit-prix-lineaire').text();
            let stock = $(this).find('.stock').text();
            let produit = {
              titre: titre,
              marque: marque,
              prix: prix,
              stock: stock
            };
            datas.push(produit);
          })
          return datas;
        })
        // console.log(infos);
        return infos;
    }
    catch (e) {
      throw new TypeError(e.message);
    }
  },

  changeAgence: async function (page, ville) {
    try {    
      console.log('CHANGE AGENCE');
      await page.goto('https://www.chausson-materiaux.fr/articles/3917/gros-oeuvre-et-maconnerie/ciment-chaux-mortier-beton');    
      await page.waitFor(3000);
      if (await page.$('#visible-sidebar .agence-bouton') !== null) {
        await page.click('#visible-sidebar .agence-bouton');
      }
      await page.waitFor('.popup-agence');
      await page.type('.uk-form > input', ville);
      await page.keyboard.press(String.fromCharCode(13));     
      await page.waitFor(2000);
      await page.click('.gMapDivListAndMap ul li:first-child span.picto-check');
      await page.waitFor(5000);
      return page;
    }
    catch (e) {
      throw new Error(e.message);    
    }
  },

  triProduits: async function(infosProduits, productKeywords, ville) {
    try {    
      let selectedProducts = [];
      for (let i=0; i<infosProduits.length; i++) {
        if (productKeywords.some(keyword => infosProduits[i]['titre'].includes(keyword))) {
          infosProduits[i]['titre'] = infosProduits[i]['titre'].trim();
          infosProduits[i]['marque'] = await module.exports.formatMarque(infosProduits[i]['marque']);
          let prixFormated = await module.exports.formatPrix(infosProduits[i]['prix']);
          infosProduits[i]['prix'] = prixFormated.prixHT;
          infosProduits[i]['prixTTC'] = prixFormated.prixTTC;
          let stockFormated = await module.exports.formatStock(infosProduits[i]['stock']);
          if (/^\d+$/.test(stockFormated)) {
            infosProduits[i]['stock'] = stockFormated;
            infosProduits[i]['disponibilite'] = '';
          }
          else {
            infosProduits[i]['stock'] = '0';
            if (stockFormated.indexOf('sous') > -1) {
              infosProduits[i]['disponibilite'] = stockFormated.substr(stockFormated.indexOf('sous'));  
            }
            else {
              infosProduits[i]['disponibilite'] = stockFormated;          
            }
          }
          infosProduits[i]['agence'] = ville;

          selectedProducts.push(infosProduits[i]);
        }
      }
      return selectedProducts;
    }
    catch (e) {
      throw new Error(e.message);        
    }
  },

  formatPrix: async function(prix) {
    try {    
      let prixFormated;
      let prixTTC;
      let tauxTVA = '20';
      if (prix.indexOf('€') > -1) {
        prixFormated = prix.substr(0, prix.indexOf('€')).replace(/(\r\n|\n|\r)/gm, "").replace('  ', '').trim();
        let TVA = (+prixFormated * +tauxTVA) / 100;
        prixTTC = +prixFormated + +TVA;
        prixTTC = (Math.round(prixTTC * 100) / 100).toFixed(2);
      }
      else {
       prixFormated = prix.replace(/(\r\n|\n|\r)/gm, "").replace('  ', '').trim(); 
       prixTTC = '';
      }
      let prixInfos = {
        prixHT: prixFormated,
        prixTTC: prixTTC
      };
      return prixInfos;
    }
    catch (e) {
      throw new Error(e.message);            
    }
  },

  formatStock: async function(stock) {
    try {    
      let stockFormated;
      if (stock.includes('En stock')) {
        stockFormated = stock.replace(/\D/g,'');
      }
      else {
       stockFormated = stock.replace(/(\r\n|\n|\r)/gm, "").replace('  ', '').trim(); 
      }
      return stockFormated;
    }
    catch (e) {
      throw new Error(e.message);                
    }
  },

  formatMarque: async function(marque) {
    try {    
      if (marque.includes('Marque')) {
        marque = marque.replace('Marque :', '').trim();
      }
      return marque;
    }
    catch (e) {
      throw new Error(e.message);                    
    }
  },

  // Insertion des résultats en base de données
  writeInDb: function(infosAnnonce) {
      console.dir(infosAnnonce);
      return new Promise(function(resolve, reject) {
          var connection = mysql.createConnection({
              host: 'localhost',
              user: 'root',
              password: '',
              database: 'scraping',
              charset: 'utf8_general_ci'            
          });

          // var description = infosAnnonce.description.replace("\\", "");z
          var description = infosAnnonce.description.replace("\\\\", "");
          description = description.replace(/'/g, "\\'").trim();
          var name = infosAnnonce.name.replace(/'/g, "\\'");
          var price = infosAnnonce.price.replace(/'/g, "\\'");
          let infos_complementaires = JSON.stringify(infosAnnonce.details).replace(/'/g, "\\'");


          connection.connect(function(err) {
              if (err) throw err;
              console.log('Connected to Database');
              try {           
                  connection.query(`INSERT INTO immobilierch_terrains (name, prix, details, description, promoteur, lat, lng, url, date)
                      VALUES ('${name}', '${price}', '${infos_complementaires}', 
                      '${description}', '${infosAnnonce.promoteur}', '${infosAnnonce.lat}', '${infosAnnonce.lng}', '${infosAnnonce.url}', NOW())`, 
                      function(err, result) {
                        console.log('WRITING...');
                        if (err) console.log(err);
                        connection.end();
                        resolve(result);
                      }
                  );
              }
              catch(error) {
                console.log(error);
                resolve(error);
              }
          });
      });
  },

  writeInExcel: async function(sheet, datas) {
    return new Promise(async function(resolve, reject) { 
      for (let z=0; z<datas.length; z++) {
        // await insertionExcel(datas[z]);
        await writeInSheet.launch(sheet, datas[z]);
      }
      resolve();
    })
  },

  insertionExcel: async function(datas) {
    try {
      excelTab.cell(numRow, 1)
        .string(datas['agence'])
      excelTab.cell(numRow, 2)
        .string(datas['marque'])
        // .style(style);
      excelTab.cell(numRow, 3)
        .string(datas['titre'])
        // .style(style);
      excelTab.cell(numRow, 4)
        .string(datas['prixTTC'])
        // .style(style);
      excelTab.cell(numRow, 5)
        .string(datas['prix'])
        // .style(style);           
      excelTab.cell(numRow, 6)
        .string(datas['disponibilite'])
        // .style(style);             
      excelTab.cell(numRow, 7)
        .string(datas['stock'])
        // .style(style);                         
      wb.write('./chaussonResults.xlsx');
      ++numRow;
      return;
    }
    catch (e) {
      throw new Error(e.message);                        
    }
  },

  autoScroll: async function(page){
      await page.evaluate(async () => {
          await new Promise((resolve, reject) => {
              var totalHeight = 0;
              var distance = 1000;
              var timer = setInterval(() => {
                  var scrollHeight = document.body.scrollHeight;
                  window.scrollBy(0, distance);
                  totalHeight += distance;

                  if(totalHeight >= 10000){
                      clearInterval(timer);
                      resolve();
                  }
              }, 1000);
          });
      });
  },

  sleep: async function(time) {
    setTimeout(function() {
      return true;
    }, time)
  }
}

