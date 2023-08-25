const search_1337x_json = require('./search_1337x.task.json')
const torrent_details_1337x_json = require('./torrent_details_1337x.task.json')

const catalog = [
    {
        "domain_name":"1337x",
        "urls":[
            {
                "name":"Search",
                "task":search_1337x_json
            },
            {
                "name":"Details",
                "task":torrent_details_1337x_json
            }
        ]
    }
]

module.exports = catalog