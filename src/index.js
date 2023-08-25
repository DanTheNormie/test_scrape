const express = require('express');
const path = require('path')
const cors = require('cors')
const app = express()
const { Cluster } = require('puppeteer-cluster')

/* puppeteer config */
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
const useProxy = require('puppeteer-page-proxy');
puppeteer.use(StealthPlugin())

const taskRunner = require('./improved_scripts/pure_scraping_script')
const domains = require('./tasks/catalog')

let cluster;

(async () => {

    cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_PAGE,
        maxConcurrency: 3,
        puppeteerOptions: {
            headless: 'new'
        },
        puppeteer:puppeteer,
        timeout:60000,
    })
    cluster.on('taskerror', (err, data, willRetry) => {
        if (willRetry) {
          console.warn(`Encountered an error while crawling ${data}. ${err.message}\nThis job will be retried`);
        } else {
          console.error(`Failed to crawl ${data}: ${err.message}`);
        }
    });
    console.log('puppeteer browser running');
})();

async function attachPuppeteer(req, res, next) {
    if (!req.puppeteer) {
        req.puppeteer = { cluster }
    }
    next()
}

const PORT = process.env.PORT || 3000

/* config */
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cors())
app.use(attachPuppeteer)

async function fetchMagnetLinksFrom1337x(torrents_data_array, details_task, cluster) {
    const fetchMagnetLinkPromises = torrents_data_array.map(async (torrent_data) => {
        try{
            const details_url = `https://1337x.unblockit.rsvp${torrent_data['torrent_details_page_link']}`;
            details_task.params['torent_details_url'].value = details_url;
            return await cluster.execute(details_task,async({page, data})=>{
                page.setRequestInterception(true)

                page.on ( 'request', async request => {
                    if (request.resourceType () === 'fetch' || request.resourceType () === 'stylesheet' || request.resourceType () === 'image' || request.resourceType () === 'media' || request.resourceType () === 'font' ) {
                        request.abort ()
                    } else {
                        request.continue ()
                    }
                })
                const {magnet_link}  = await taskRunner(page, data);
            
                return { ...torrent_data, magnet_link };
            })
        }
        catch(err){
            console.log(err);
            throw new Error (err.message);
        }
    });
    return await Promise.allSettled(fetchMagnetLinkPromises);
}

app.use(require('express-status-monitor')());

/* Traffic Signal */
app.get('/data',async (req,res,next)=>{
    const {cluster} = req.puppeteer
    const {keyword} = req.query
    const search_task = domains.find((e)=>e['domain_name']==="1337x").urls.find((e)=>e['name']==="Search").task
    const details_task = domains.find((e)=>e['domain_name']==="1337x").urls.find((e)=>e['name']==="Details").task

    search_task.params['search_text'].value = keyword
    
    try{
        let torrents_data_array
        let data = {search_task,details_task}
        return await cluster.execute(data, async({page,data})=>{
            page.setRequestInterception(true)

            page.on ( 'request', async request => {
                if ( request.resourceType () === 'stylesheet' || request.resourceType () === 'image' || request.resourceType () === 'media' || request.resourceType () === 'font' ) {
                    request.abort ()
                } else {
                    request.continue ()
                }
            })
            console.log(data);
            torrents_data_array = await taskRunner(page, data.search_task)
            torrents_data_array =  await fetchMagnetLinksFrom1337x(torrents_data_array, data.details_task, cluster);
    
            console.log(torrents_data_array);
            
            return res.json({
                success:true,
                data:torrents_data_array,
                message:'Data Fetched Successfully'
            })
        })
    }catch(err){
        return res.json({
            success:false,
            message:"Request Failed (or) No data for given data",
            error:err.message
        })
    }

})

app.get('/data2', async (req,res)=>{
    const {cluster} = req.puppeteer
    const {keyword} = req.query
    const search_task = domains.find((e)=>e['domain_name']==="Pirate-Bay").urls.find((e)=>e['name']==="Search").task

    search_task.params['search_text'].value = keyword

    try{
        return await cluster.execute(search_task, async ({page,data})=>{
            const torrents_data_array = await taskRunner(page, data)
            console.log(torrents_data_array);

            if(torrents_data_array[0].title === 'No results returned'){
                return res.status(404).json({
                    success:false,
                    message:"No Data found for given Keyword"
                })
            }
        
            return res.json({
                success:true,
                data:torrents_data_array,
                message:'Data Fetched Successfully'
            })

        })
        
    }catch(err){
        return res.json({
            success:false,
            message:"Request Failed (or) No data for given keyword",
            error:err.message
        })
    }
})





app.listen(PORT, async () => {

    console.log(`Express server running on port ${PORT}`);
})



