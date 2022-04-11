const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const scrapChausson = require('./getChaussons');
const writeInSheet = require('./writeInSheet2');
const nodemailer = require('nodemailer');


module.exports = class ClusterManager {

	constructor(monitor, maxConcurrency) {
		this.monitor = monitor;
		this.maxConcurrency = maxConcurrency;
		this.failedCitys = [];
		this.init();
		this.errorCount = 0;
		this.refreshErrorCount();
	}

	async init() {
		this.cluster = await Cluster.launch({
		    concurrency: Cluster.CONCURRENCY_CONTEXT,
		    maxConcurrency: this.maxConcurrency,
		    monitor: this.monitor,
		});			
	}

	async enqueue(ville, sheet) {
		return new Promise((resolve, reject) => {
			this.cluster.queue(ville);
			resolve();
		})
	}	

	async launch(sheet) {
		return new Promise((resolve, reject) => {		
	        // In case of problems, log them
	        this.cluster.on('taskerror', (err, data) => {       	
		        let date = new Date();
		        let structuredMessage = `${date} - ${err} - ERROR POUR LA VILLE ${data}\r\n`;
	            console.log(`  Error crawling ${data}: ${err.message}`);
	            this.logError(structuredMessage, data);
	            this.sendMail(structuredMessage);
	            if (this.failedCitys.indexOf(data) == -1) {
	            	this.failedCitys.push(data);
	            }
	            this.incrementErrorCount();
	            console.dir(this.failedCitys); 	            
	        });

			this.cluster.task(async ({ page, data }) => {
	            let selectedProducts = await scrapChausson.launch(page, data, sheet);
	            // let recordingResult = await scrapChausson.writeInDb(result);
	            if(selectedProducts !== false) {
	            	if (this.failedCitys.indexOf(data) > -1) {
	            		console.log('SPLICE !');
	            		let indexToDrop = this.failedCitys.indexOf(data);
	            		this.failedCitys.splice(indexToDrop, 1);
	            	}
	            	for (let c=0; c<selectedProducts.length; c++) {
	            		await writeInSheet.timeOut(2000);
		    			await writeInSheet.launch(sheet, selectedProducts[c]);	
		    			// await writeInSheet.colorize(sheet, selectedProducts[c]);	
	            	}
	            	console.log('END OF CITY');
	            }
	            // else {
	            // 	console.log(recordingResult);
	            // }
	        })

			resolve(this.failedCitys);
		})


	}

	refreshErrorCount() {
		setInterval(function() {
			console.log('RESET ERRORCOUNT !!');
			this.errorCount = 0;
		}, 240000)
	}

	incrementErrorCount() {
    	++this.errorCount;
    	console.log('ERRORCOUNT = '+this.errorCount);
    	if (this.errorCount > 8) {
    		this.finish();
    		process.exit();
    	}			
	}

	async getIdle() {
        await this.cluster.idle();
	}

	async finish() {
        await this.cluster.close();		
	}

	async logError(err, ville) {
        fs.appendFile('./chausson_logs.txt', err, function (err) {
          if (err) throw err;
        });  		
	}

	async sendMail(errorMessage) {
		var transporter = nodemailer.createTransport({
         service: 'gmail',
         port: 465,
         auth: {
                user: '***',
                pass: '***',
            },
              secure: true,    
        });

	    var mailOptions = {
	      from: '***', // sender address
	      to: '***', // list of receivers
	      subject: 'GetChausson - information scraping', // Subject line
	      html: `<p>Une erreur de scraping vient d'être constatée pour l'application getChausson : 
	      ${errorMessage}</p>`
	    };

	    console.log(mailOptions);

	    transporter.sendMail(mailOptions, function (err, info) {
	       if(err) {
	          console.log(err)
	       }
	       else {
	          console.log('MAILSENT !');
	       }
	    }); 
	}

}
