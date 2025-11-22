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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = 10009
const COOKIE_SECRET = 'your_very_secure_secret_key_here' // In production, this should be an env var

// Middleware
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(cookieParser(COOKIE_SECRET))
app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '../views'))

// User storage
const usersFile = path.join(__dirname, '../database/web_users.json')
if (!fs.existsSync(path.dirname(usersFile))) {
    fs.mkdirSync(path.dirname(usersFile), { recursive: true })
}
if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([]))
}

const getUsers = () => JSON.parse(fs.readFileSync(usersFile, 'utf-8'))
const saveUser = (user) => {
    const users = getUsers()
    users.push(user)
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2))
}
const findUser = (username) => getUsers().find(u => u.username === username)

// Subbot logic
if (global.conns instanceof Array) console.log()
else global.conns = []

// Helper to get session path
const getSessionPath = (id) => {
    const baseDir = global.jadi || 'Sessions/SubBot'
    return path.join(baseDir, id)
}

async function startSubBot(phoneNumber) {
     let id = phoneNumber.replace(/[^0-9]/g, '')
     let pathYukiJadiBot = getSessionPath(id)

    if (!fs.existsSync(pathYukiJadiBot)) {
        fs.mkdirSync(pathYukiJadiBot, { recursive: true })
    }

    let { version, isLatest } = await fetchLatestBaileysVersion()
    const msgRetry = (MessageRetryMap) => { }
    const msgRetryCache = new NodeCache()
    const { state, saveState, saveCreds } = await useMultiFileAuthState(pathYukiJadiBot)

    const connectionOptions = {
        logger: pino({ level: "fatal" }),
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        msgRetry,
        msgRetryCache,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
        version: version,
        generateHighQualityLinkPreview: true
    }

    let sock = makeWASocket(connectionOptions)
    sock.isInit = false
    let isInit = true

    // Promise to return the pairing code
    const codePromise = new Promise((resolve, reject) => {
        // Timeout if code generation takes too long (e.g., 20 seconds)
        const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for pairing code'))
        }, 20000)

        const checkCode = async () => {
             if (!sock.authState.creds.me) {
                 try {
                     let code = await sock.requestPairingCode(id)
                     code = code?.match(/.{1,4}/g)?.join("-")
                     clearTimeout(timeout)
                     resolve(code)
                 } catch (e) {
                     // If requestPairingCode fails (e.g. rate limit), reject
                     clearTimeout(timeout)
                     reject(e)
                 }
             } else {
                 clearTimeout(timeout)
                 resolve(null) // Already logged in
             }
        }

        // Wait slightly for socket init before requesting code
        setTimeout(checkCode, 3000)
    })


    // Clean up if not logged in
    setTimeout(async () => {
        if (!sock.user) {
            try { fs.rmSync(pathYukiJadiBot, { recursive: true, force: true }) } catch { }
            try { sock.ws?.close() } catch { }
            sock.ev.removeAllListeners()
            let i = global.conns.indexOf(sock)
            if (i >= 0) global.conns.splice(i, 1)
            console.log(`[AUTO-LIMPIEZA] Sesión ${path.basename(pathYukiJadiBot)} eliminada (Web initiated).`)
        }
    }, 60000)

    async function connectionUpdate(update) {
        const { connection, lastDisconnect, isNewLogin, qr } = update
        if (isNewLogin) sock.isInit = false

        const endSesion = async (loaded) => {
            if (!loaded) {
                try { sock.ws.close() } catch { }
                sock.ev.removeAllListeners()
                let i = global.conns.indexOf(sock)
                if (i < 0) return
                delete global.conns[i]
                global.conns.splice(i, 1)
            }
        }

        const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode
        if (connection === 'close') {
             if (reason === 428 || reason === 408 || reason === 515) {
                 console.log(chalk.bold.magentaBright(`Reconectando ${path.basename(pathYukiJadiBot)}...`))
                 await creloadHandler(true).catch(console.error)
             }
             if (reason === 403 || reason === 405 || reason === 401) {
                 console.log(chalk.bold.red(`Sesión cerrada/invalida ${path.basename(pathYukiJadiBot)}`))
                 fs.rmSync(pathYukiJadiBot, { recursive: true, force: true })
             }
             if (reason === 500) {
                 console.log(chalk.bold.red(`Error 500 en ${path.basename(pathYukiJadiBot)}`))
                 await creloadHandler(true).catch(console.error)
             }
        }

        if (global.db.data == null) loadDatabase()

        if (connection == `open`) {
            if (!global.db.data?.users) loadDatabase()
            let userName = sock.authState.creds.me.name || 'Anónimo'
            console.log(chalk.bold.cyanBright(`SUB-BOT WEB CONECTADO: ${userName} (+${path.basename(pathYukiJadiBot)})`))
            sock.isInit = true
            global.conns.push(sock)
        }

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
    }
    sock.ev.on("connection.update", connectionUpdate)
    sock.ev.on('creds.update', saveCreds)

    return codePromise
}


// Routes
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
    const connectedSubbots = global.conns.filter(c => c.user).length
    res.render('dashboard', {
        username: req.signedCookies.user,
        connectedSubbots,
        code: null
    })
})

app.post('/request-code', async (req, res) => {
    if (!req.signedCookies.user) return res.redirect('/login')
    const { phoneNumber } = req.body

    if (!phoneNumber) return res.redirect('/dashboard')

    try {
        const code = await startSubBot(phoneNumber)
        const connectedSubbots = global.conns.filter(c => c.user).length

        res.render('dashboard', {
            username: req.signedCookies.user,
            connectedSubbots,
            code: code || "Ya estás conectado o hubo un error."
        })

    } catch (e) {
        console.error(e)
        const connectedSubbots = global.conns.filter(c => c.user).length
        res.render('dashboard', {
            username: req.signedCookies.user,
            connectedSubbots,
            code: `Error: ${e.message}`
        })
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
