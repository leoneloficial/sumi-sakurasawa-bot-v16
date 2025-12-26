import { watchFile, unwatchFile } from "fs"
import chalk from "chalk"
import { fileURLToPath } from "url"
import fs from "fs"

global.botNumber = "" 

global.owner = ["393715279301", "393715279301", "50493732693"]
global.suittag = [""] 
global.prems = []

global.libreria = "Baileys Multi Device"
global.vs = "^1.8.2|Latest"
global.sessions = "Sessions/Principal"
global.jadi = "Sessions/SubBot"
global.yukiJadibts = true

global.botname = '🤍̶۫̄͟Ⓢ︎𓏲S͟u͟m͟m͟i͟𓍲̈͜𝗨̴ᥣ̥𝗍̈rᥲ̄𓊓̵̬𝐁o̸🤍̶۫̄͟─'
global.textbot = '🤍 sumi 🤍'
global.dev = ''
global.author = ''
global.etiqueta = ''
global.currency = '€ 𝖤𝖴𝖱𝖮𝖲'
global.banner = "https://files.catbox.moe/hqflu9.jpg"
global.icono = "https://files.catbox.moe/tm96iw.jpg"
global.catalogo = fs.readFileSync('./lib/catalogo.jpg')

global.group = "https://chat.whatsapp.com/CpvSbnjeibV03OaVhn8bxR"
global.community = "https://chat.whatsapp.com/CpvSbnjeibV03OaVhn8bxR"
global.channel = "https://whatsapp.com/channel/0029Vb64nWqLo4hb8cuxe23n"
global.github = "https://github.com/The-King-Destroy/YukiBot-MD"
global.gmail = "thekingdestroy507@gmail.com"
global.ch = {
ch1: "120363401404146384@newsletter"
}

global.APIs = {
xyro: { url: "https://api.xyro.site", key: null },
yupra: { url: "https://api.yupra.my.id", key: null },
vreden: { url: "https://api.vreden.web.id", key: null },
delirius: { url: "https://api.delirius.store", key: null },
zenzxz: { url: "https://api.zenzxz.my.id", key: null },
siputzx: { url: "https://api.siputzx.my.id", key: null },
adonix: { url: "https://api-adonix.ultraplus.click", key: 'Leonel' }
}

let file = fileURLToPath(import.meta.url)
watchFile(file, () => {
unwatchFile(file)
console.log(chalk.redBright("Update 'settings.js'"))
import(`${file}?update=${Date.now()}`)
})
