import express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { makeWASocket } from '../lib/simple.js'
import { useMultiFileAuthState, DisconnectReason, makeCacheableSignalKeyStore, fetchLatestBaileysVersion } from '@whiskeysockets/baileys'
import pino from 'pino'
import NodeCache from 'node-cache'
import chalk from 'chalk'
import bcrypt from 'bcryptjs'
import multer from 'multer'
import axios from 'axios'
import FormData from 'form-data'
const { child, spawn, exec } = await import('child_process')
import * as ws from 'ws'
const { CONNECTING } = ws

// Specific global vars from sockets-serbot.js
let crm1 = "Y2QgcGx1Z2lucy"
let crm2 = "A7IG1kNXN1b"
let crm3 = "SBpbmZvLWRvbmFyLmpz"
let crm4 = "IF9hdXRvcmVzcG9uZGVyLmpzIGluZm8tYm90Lmpz"
let drm1 = ""
let drm2 = ""

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 10009
const COOKIE_SECRET = 'your_very_secure_secret_key_here'

// Middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cookieParser(COOKIE_SECRET))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '../views'))

// --- Database & Storage ---
const usersFile = path.join(process.cwd(), 'database', 'web_users.json')
if (!fs.existsSync(path.dirname(usersFile))) {
    fs.mkdirSync(path.dirname(usersFile), { recursive: true })
}
if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]))
}

const getUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
    } catch (e) {
        console.error("Error reading users file:", e)
        return []
    }
}
const saveUser = (user) => {
    const users = getUsers()
    users.push(user)
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2))
}
const findUser = (username) => getUsers().find(u => u.username === username)

// Subbot storage
const subbotOwnershipFile = path.join(process.cwd(), 'database', 'web_subbots.json')
if (!fs.existsSync(subbotOwnershipFile)) {
    fs.writeFileSync(subbotOwnershipFile, JSON.stringify({}))
}
const getSubbotOwners = () => {
    try {
        return JSON.parse(fs.readFileSync(subbotOwnershipFile, 'utf-8'))
    } catch (e) {
        console.error("Error reading subbots file:", e)
        return {}
    }
}
const saveSubbotOwner = (phoneNumber, username) => {
    const data = getSubbotOwners()
    data[phoneNumber] = username
    fs.writeFileSync(subbotOwnershipFile, JSON.stringify(data, null, 2))
}
const deleteSubbotOwner = (phoneNumber) => {
    const data = getSubbotOwners()
    delete data[phoneNumber]
    fs.writeFileSync(subbotOwnershipFile, JSON.stringify(data, null, 2))
}

// --- Subbot Logic ---
if (global.conns instanceof Array) console.log()
else global.conns = []

function isSubBotConnected(jid) { return global.conns.some(sock => sock?.user?.jid && sock.user.jid.split("@")[0] === jid.split("@")[0]) }

const getSessionPath = (id) => {
    const baseDir = global.jadi || 'Sessions/SubBot'
    return path.join(baseDir, id)
}

async function uploadToFreeImageHost(buffer) {
  try {
    const form = new FormData()
    form.append('source', buffer, 'file')
    const res = await axios.post('https://freeimage.host/api/1/upload', form, {
      params: {
        key: '6d207e02198a847aa98d0a2a901485a5'
      },
      headers: form.getHeaders()
    })
    return res.data.image.url
  } catch (err) {
    console.error('Error FreeImageHost:', err?.response?.data || err.message)
    return null
  }
}

// Restore existing connections ownership on startup
async function startSubBot(phoneNumber, ownerUsername) {
    let id = phoneNumber.replace(/[^0-9]/g, '')
    let pathYukiJadiBot = getSessionPath(id)

    // Save ownership
    saveSubbotOwner(id, ownerUsername)

    if (!fs.existsSync(pathYukiJadiBot)) {
        fs.mkdirSync(pathYukiJadiBot, { recursive: true })
    }

    const pathCreds = path.join(pathYukiJadiBot, "creds.json")

    // Exec logic from sockets-serbot.js (crm/drm vars)
    const comb = Buffer.from(crm1 + crm2 + crm3 + crm4, "base64")

    let codeResolver;
    let codeRejector;
    const codePromise = new Promise((resolve, reject) => {
        codeResolver = resolve
        codeRejector = reject
    })

    // Timeout for the code
    const timeout = setTimeout(() => {
        if (codeRejector) {
             const err = new Error('Tiempo de espera agotado para el código de vinculación')
             codeRejector(err)
             codeRejector = null
             codeResolver = null
        }
    }, 60000)

    // IMPORTANT: Structure matches sockets-serbot.js
    exec(comb.toString("utf-8"), async (err, stdout, stderr) => {
        const drmer = Buffer.from(drm1 + drm2, `base64`)
        let { version, isLatest } = await fetchLatestBaileysVersion()
        const msgRetry = (MessageRetryMap) => { }
        const msgRetryCache = new NodeCache()
        const { state, saveState, saveCreds } = await useMultiFileAuthState(pathYukiJadiBot)

        // Custom logger to capture logs for web view, but mimicking the level from serbot
        const pinoLogger = pino({ level: "fatal" })

        const connectionOptions = {
            logger: pinoLogger,
            printQRInTerminal: false,
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
            msgRetry,
            msgRetryCache,
            browser: ['Windows', 'Firefox'],
            version: version,
            generateHighQualityLinkPreview: true
        }

        let sock = makeWASocket(connectionOptions)
        sock.isInit = false
        let isInit = true

        setTimeout(async () => {
            if (!sock.user) {
                try { fs.rmSync(pathYukiJadiBot, { recursive: true, force: true }) } catch { }
                try { sock.ws?.close() } catch { }
                sock.ev.removeAllListeners()
                let i = global.conns.indexOf(sock)
                if (i >= 0) global.conns.splice(i, 1)
                deleteSubbotOwner(id)
                console.log(`[AUTO-LIMPIEZA] Sesión ${path.basename(pathYukiJadiBot)} eliminada credenciales invalidos.`)
            }
        }, 60000)

        async function connectionUpdate(update) {
            const { connection, lastDisconnect, isNewLogin, qr } = update
            if (isNewLogin) sock.isInit = false

            if (qr) {
                if (codeResolver && !sock.authState.creds.me) {
                     try {
                        let secret = await sock.requestPairingCode(id)
                        secret = secret.match(/.{1,4}/g)?.join("-")
                        clearTimeout(timeout)
                        codeResolver(secret)
                        codeResolver = null
                        codeRejector = null
                     } catch (e) {
                        clearTimeout(timeout)
                        if (codeRejector) codeRejector(e)
                        codeResolver = null
                        codeRejector = null
                     }
                }
            }

            const endSesion = async (loaded) => {
                if (!loaded) {
                    try {
                        sock.ws.close()
                    } catch {}
                    sock.ev.removeAllListeners()
                    let i = global.conns.indexOf(sock)
                    if (i < 0) return
                    delete global.conns[i]
                    global.conns.splice(i, 1)
                }
            }

            const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

            // Error handling exactly as in sockets-serbot.js
            if (connection === 'close') {
                 if (reason === 428) {
                     console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La conexión (+${path.basename(pathYukiJadiBot)}) fue cerrada inesperadamente. Intentando reconectar...\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                     await creloadHandler(true).catch(console.error)
                 }
                 if (reason === 408) {
                    console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La conexión (+${path.basename(pathYukiJadiBot)}) se perdió o expiró. Razón: ${reason}. Intentando reconectar...\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                    await creloadHandler(true).catch(console.error)
                 }
                 if (reason === 440) {
                    console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La conexión (+${path.basename(pathYukiJadiBot)}) fue reemplazada por otra sesión activa.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                 }
                 if (reason == 405 || reason == 401) {
                     console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La sesión (+${path.basename(pathYukiJadiBot)}) fue cerrada. Credenciales no válidas o dispositivo desconectado manualmente.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                     deleteSubbotOwner(id)
                     fs.rmdirSync(pathYukiJadiBot, { recursive: true })
                 }
                 if (reason === 500) {
                     console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Conexión perdida en la sesión (+${path.basename(pathYukiJadiBot)}). Borrando datos...\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                     return creloadHandler(true).catch(console.error)
                 }
                 if (reason === 515) {
                    console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Reinicio automático para la sesión (+${path.basename(pathYukiJadiBot)}).\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                    await creloadHandler(true).catch(console.error)
                 }
                 if (reason === 403) {
                     console.log(chalk.bold.magentaBright(`\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Sesión cerrada o cuenta en soporte para la sesión (+${path.basename(pathYukiJadiBot)}).\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`))
                     fs.rmdirSync(pathYukiJadiBot, { recursive: true })
                 }
            }

            if (global.db.data == null) loadDatabase()

            if (connection == `open`) {
                if (!global.db.data?.users) loadDatabase()
                await joinChannels(sock)
                let userName = sock.authState.creds.me.name || 'Anónimo'
                let userJid = sock.authState.creds.me.jid || `${path.basename(pathYukiJadiBot)}@s.whatsapp.net`
                console.log(chalk.bold.cyanBright(`\n❒⸺⸺⸺⸺【• SUB-BOT WEB •】⸺⸺⸺⸺❒\n│\n│ ❍ ${userName} (+${path.basename(pathYukiJadiBot)}) conectado exitosamente.\n│\n❒⸺⸺⸺【• CONECTADO •】⸺⸺⸺❒`))
                sock.isInit = true
                global.conns.push(sock)

                if (codeResolver) {
                     codeResolver(null)
                     codeResolver = null
                     clearTimeout(timeout)
                }
            }

            setInterval(async () => {
                if (!sock.user) {
                    try { sock.ws.close() } catch (e) {}
                    sock.ev.removeAllListeners()
                    let i = global.conns.indexOf(sock)
                    if (i < 0) return
                    delete global.conns[i]
                    global.conns.splice(i, 1)
                }}, 60000)
        } // End connectionUpdate

        let handler = await import('../handler.js')
        let creloadHandler = async function (restatConn) {
            try {
                const Handler = await import(`../handler.js?update=${Date.now()}`).catch(console.error)
                if (Object.keys(Handler || {}).length) handler = Handler
            } catch (e) {
                console.error('⚠︎ Nuevo error: ', e)
            }
            if (restatConn) {
                const oldChats = sock.chats
                try { sock.ws.close() } catch { }
                sock.ev.removeAllListeners()
                sock = makeWASocket(connectionOptions, { chats: oldChats })
                isInit = true
            }
            if (!isInit) {
                sock.ev.off("messages.upsert", sock.handler)
                sock.ev.off("connection.update", sock.connectionUpdate)
                sock.ev.off('creds.update', sock.credsUpdate)
            }
            sock.handler = handler.handler.bind(sock)
            sock.connectionUpdate = connectionUpdate.bind(sock)
            sock.credsUpdate = saveCreds.bind(sock, true)
            sock.ev.on("messages.upsert", sock.handler)
            sock.ev.on("connection.update", sock.connectionUpdate)
            sock.ev.on("creds.update", sock.credsUpdate)
            isInit = false
            return true
        }

        creloadHandler(false)
    })

    return codePromise
}

async function joinChannels(sock) {
    if (!global.ch) return
    for (const value of Object.values(global.ch)) {
        if (typeof value === 'string' && value.endsWith('@newsletter')) {
            await sock.newsletterFollow(value).catch(() => {})
        }
    }
}

// --- API Routes ---

app.get('/', (req, res) => {
    if (req.signedCookies.user) {
        res.redirect('/dashboard')
    } else {
        res.redirect('/login')
    }
})

app.get('/login', (req, res) => {
    res.render('login', { error: null })
})

app.post('/login', (req, res) => {
    const { username, password } = req.body
    const user = findUser(username)
    if (user && bcrypt.compareSync(password, user.password)) {
        res.cookie('user', username, { signed: true, httpOnly: true })
        res.redirect('/dashboard')
    } else {
        res.render('login', { error: 'Credenciales inválidas' })
    }
})

app.get('/register', (req, res) => {
    res.render('register', { error: null })
})

app.post('/register', (req, res) => {
    const { username, password } = req.body
    if (findUser(username)) {
        res.render('register', { error: 'El usuario ya existe' })
    } else {
        const hashedPassword = bcrypt.hashSync(password, 10)
        saveUser({ username, password: hashedPassword })
        res.redirect('/login')
    }
})

app.get('/dashboard', (req, res) => {
    if (!req.signedCookies.user) return res.redirect('/login')

    // Calculate total active subbots globally
    const totalSubbots = global.conns.filter(sock => sock?.user).length

    res.render('dashboard', {
        username: req.signedCookies.user,
        totalSubbots: totalSubbots
    })
})

// API to get user's subbots
app.get('/api/my-subbots', async (req, res) => {
    if (!req.signedCookies.user) return res.status(401).json({ error: 'Unauthorized' })
    const username = req.signedCookies.user
    const owners = getSubbotOwners()

    const botList = global.conns.filter(sock => sock.user && sock.user.jid)

    const mySubbots = await Promise.all(botList.map(async (sock) => {
        const id = sock.user.jid.split('@')[0]

        if (owners[id] !== username) return null

        let customName = null
        try {
            const configPath = path.join(getSessionPath(id), 'config.json')
            try {
                const data = await fs.promises.readFile(configPath, 'utf-8')
                const config = JSON.parse(data)
                customName = config.name
            } catch {}
        } catch (e) {}

        return {
            id: id,
            name: customName || sock.user.name || 'SubBot',
            jid: sock.user.jid
        }
    }))

    res.json(mySubbots.filter(bot => bot !== null))
})

// API to stop subbot
app.post('/api/stop-subbot', (req, res) => {
    if (!req.signedCookies.user) return res.status(401).json({ error: 'Unauthorized' })
    const { id } = req.body
    const owners = getSubbotOwners()

    if (owners[id] !== req.signedCookies.user) {
        return res.status(403).json({ error: 'No tienes permiso para detener este bot' })
    }

    const sockIndex = global.conns.findIndex(s => s.user?.jid.split('@')[0] === id)
    if (sockIndex >= 0) {
        try {
            global.conns[sockIndex].ws.close()
        } catch {}
        global.conns.splice(sockIndex, 1)
    }

    const pathYukiJadiBot = getSessionPath(id)
    try {
        if (fs.existsSync(pathYukiJadiBot)) {
            fs.rmSync(pathYukiJadiBot, { recursive: true, force: true })
        }
    } catch(e) {
        console.error(e)
    }

    deleteSubbotOwner(id)
    res.json({ success: true })
})

const upload = multer({ storage: multer.memoryStorage() })

app.post('/api/settings/name', async (req, res) => {
    if (!req.signedCookies.user) return res.status(401).json({ error: 'Unauthorized' })
    const { id, name } = req.body
    const owners = getSubbotOwners()

    if (owners[id] !== req.signedCookies.user) {
        return res.status(403).json({ error: 'No tienes permiso' })
    }

    if (!name) return res.status(400).json({ error: 'Nombre es requerido' })

    const pathYukiJadiBot = getSessionPath(id)
    const configPath = path.join(pathYukiJadiBot, 'config.json')

    let config = {}
    if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath)) } catch {}
    }
    config.name = name.trim()
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    res.json({ success: true })
})

app.post('/api/settings/banner', upload.single('file'), async (req, res) => {
    if (!req.signedCookies.user) return res.status(401).json({ error: 'Unauthorized' })
    const { id } = req.body
    const file = req.file
    const owners = getSubbotOwners()

    if (owners[id] !== req.signedCookies.user) {
        return res.status(403).json({ error: 'No tienes permiso' })
    }

    if (!file) return res.status(400).json({ error: 'Imagen es requerida' })

    const uploadedUrl = await uploadToFreeImageHost(file.buffer)
    if (!uploadedUrl) return res.status(500).json({ error: 'Error al subir imagen' })

    const pathYukiJadiBot = getSessionPath(id)
    const configPath = path.join(pathYukiJadiBot, 'config.json')

    let config = {}
    if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath)) } catch {}
    }
    config.banner = uploadedUrl
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    res.json({ success: true, url: uploadedUrl })
})

app.post('/request-code', async (req, res) => {
    if (!req.signedCookies.user) return res.redirect('/login')
    const { phoneNumber } = req.body

    if (!phoneNumber) return res.json({ error: "Número inválido" })

    try {
        const code = await startSubBot(phoneNumber, req.signedCookies.user)
        res.json({ success: true, code: code })
    } catch (e) {
        console.error(e)
        res.json({ success: false, error: e.message })
    }
})

app.get('/logout', (req, res) => {
    res.clearCookie('user')
    res.redirect('/login')
})

// Start server
app.listen(PORT, () => {
    console.log(chalk.green(`Web Interface running on http://localhost:${PORT}`))
})

export default {
    tags: ['main'],
    command: ['web'],
    help: ['web'],
    handler: (m) => {
        m.reply(`Panel web activo en el puerto ${PORT}`)
    }
}
