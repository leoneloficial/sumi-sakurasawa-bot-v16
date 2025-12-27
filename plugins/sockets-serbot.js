const {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion
} = await import('@whiskeysockets/baileys')

import qrcode from 'qrcode'
import NodeCache from 'node-cache'
import fs from 'fs'
import path from 'path'
import pino from 'pino'
import chalk from 'chalk'
import * as ws from 'ws'
import { makeWASocket } from '../lib/simple.js'
import { fileURLToPath } from 'url'
const { spawn } = await import('child_process')

const { CONNECTING } = ws

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const jadi = 'Sessions/SubBotTemp'

let rtx =
  '*❀ SER BOT • MODE QR*\n\n✰ Con otro celular o en la PC escanea este QR para convertirte en un *Sub-Bot* Temporal.\n\n`1` » Haga clic en los tres puntos en la esquina superior derecha\n\n`2` » Toque dispositivos vinculados\n\n`3` » Escanee este codigo QR para iniciar sesion con el bot\n\n✧ ¡Este código QR expira en 45 segundos!.'

let rtx2 =
  '*❀ SER BOT • MODE CODE*\n\n✰ Usa este Código para convertirte en un *Sub-Bot* Temporal.\n\n`1` » Haga clic en los tres puntos en la esquina superior derecha\n\n`2` » Toque dispositivos vinculados\n\n`3` » Selecciona Vincular con el número de teléfono\n\n`4` » Escriba el Código para iniciar sesion con el bot\n\n✧ No es recomendable usar tu cuenta principal.'

const yukiJBOptions = {}

if (!(global.conns instanceof Array)) global.conns = []

function isSubBotConnected(jid) {
  return global.conns.some(
    sock =>
      sock?.user?.jid &&
      sock.user.jid.split('@')[0] === String(jid || '').split('@')[0]
  )
}

function msToTime(duration) {
  var milliseconds = parseInt((duration % 1000) / 100)
  var seconds = Math.floor((duration / 1000) % 60)
  var minutes = Math.floor((duration / (1000 * 60)) % 60)
  var hours = Math.floor((duration / (1000 * 60 * 60)) % 24)
  hours = hours < 10 ? '0' + hours : hours
  minutes = minutes < 10 ? '0' + minutes : minutes
  seconds = seconds < 10 ? '0' + seconds : seconds
  return minutes + ' m y ' + seconds + ' s '
}

function restartBotProcess() {
  if (global.__RESTARTING_BOT__) return
  global.__RESTARTING_BOT__ = true

  try {
    if (process.send) {
      try {
        process.send('restart')
      } catch {}
      setTimeout(() => process.exit(0), 500)
      return
    }

    const isPm2 = typeof process.env.pm_id !== 'undefined' || !!process.env.PM2_HOME
    if (isPm2) {
      setTimeout(() => process.exit(0), 500)
      return
    }

    const entry = process.argv?.[1]
    if (entry) {
      const child = spawn(process.argv[0], [entry, ...process.argv.slice(2)], {
        stdio: 'inherit',
        detached: true
      })
      child.unref()
    }
  } catch {}

  setTimeout(() => process.exit(0), 500)
}

async function joinChannels(sock) {
  for (const value of Object.values(global.ch || {})) {
    if (typeof value === 'string' && value.endsWith('@newsletter')) {
      await sock.newsletterFollow(value).catch(() => {})
    }
  }
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
  try {
    const settingsRoot = globalThis?.db?.data?.settings?.[conn?.user?.jid]
    if (settingsRoot && settingsRoot.jadibotmd === false) {
      return m.reply(`ꕥ El Comando *${command}* está desactivado temporalmente.`)
    }
  } catch {}

  if (!global?.db?.data?.users) return

  if (!global.db.data.users[m.sender]) global.db.data.users[m.sender] = {}
  if (typeof global.db.data.users[m.sender].Subs !== 'number') global.db.data.users[m.sender].Subs = 0

  let time = global.db.data.users[m.sender].Subs + 120000
  if (new Date() - global.db.data.users[m.sender].Subs < 120000) {
    return conn.reply(
      m.chat,
      `ꕥ Debes esperar ${msToTime(time - new Date())} para volver a vincular un *Sub-Bot.*`,
      m
    )
  }

  let socklimit = global.conns.filter(sock => sock?.user).length
  if (socklimit >= 50) return m.reply(`ꕥ No se han encontrado espacios para *Sub-Bots* disponibles.`)

  let mentionedJid = await m.mentionedJid
  let who = mentionedJid && mentionedJid[0] ? mentionedJid[0] : m.fromMe ? conn.user.jid : m.sender
  let id = `${who.split`@`[0]}`
  let pathYukiJadiBot = path.join(`./${jadi}/`, id)

  if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

  yukiJBOptions.pathYukiJadiBot = pathYukiJadiBot
  yukiJBOptions.m = m
  yukiJBOptions.conn = conn
  yukiJBOptions.args = args
  yukiJBOptions.usedPrefix = usedPrefix
  yukiJBOptions.command = command
  yukiJBOptions.fromCommand = true

  yukiJadiBot(yukiJBOptions)

  global.db.data.users[m.sender].Subs = new Date() * 1
}

handler.help = ['qr', 'code']
handler.tags = ['serbot']
handler.command = ['qr', 'code']

export default handler

export async function yukiJadiBot(options) {
  let { pathYukiJadiBot, m, conn, args, usedPrefix, command } = options

  if (command === 'code') {
    command = 'qr'
    args.unshift('code')
  }

  const mcode =
    (args[0] && /(--code|code)/.test(args[0].trim())) ||
    (args[1] && /(--code|code)/.test(args[1].trim()))
      ? true
      : false

  let txtCode, codeBot, txtQR
  let pairingSent = false

  if (mcode) {
    args[0] = args[0].replace(/^--code$|^code$/, '').trim()
    if (args[1]) args[1] = args[1].replace(/^--code$|^code$/, '').trim()
    if (args[0] === '') args[0] = undefined
  }

  const pathCreds = path.join(pathYukiJadiBot, 'creds.json')

  if (!fs.existsSync(pathYukiJadiBot)) fs.mkdirSync(pathYukiJadiBot, { recursive: true })

  try {
    args[0] && args[0] != undefined
      ? fs.writeFileSync(
          pathCreds,
          JSON.stringify(JSON.parse(Buffer.from(args[0], 'base64').toString('utf-8')), null, '\t')
        )
      : ''
  } catch {
    conn.reply(m.chat, `ꕥ Use correctamente el comando » ${usedPrefix + command}`, m)
    return
  }

  let { version } = await fetchLatestBaileysVersion()

  const msgRetry = () => {}
  const msgRetryCache = new NodeCache()

  const { state, saveCreds } = await useMultiFileAuthState(pathYukiJadiBot)

  const connectionOptions = {
    logger: pino({ level: 'fatal' }),
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
    },
    msgRetry,
    msgRetryCache,
    browser: ['Windows', 'Firefox'],
    version,
    generateHighQualityLinkPreview: true
  }

  let sock = makeWASocket(connectionOptions)
  sock.isInit = false
  let isInit = true

  setTimeout(async () => {
    if (!sock.user) {
      try {
        fs.rmSync(pathYukiJadiBot, { recursive: true, force: true })
      } catch {}
      try {
        sock.ws?.close()
      } catch {}
      try {
        sock.ev.removeAllListeners()
      } catch {}
      let i = global.conns.indexOf(sock)
      if (i >= 0) global.conns.splice(i, 1)
      console.log(`[AUTO-LIMPIEZA] Sesión ${path.basename(pathYukiJadiBot)} eliminada credenciales invalidos.`)
    }
  }, 60000)

  async function endSesion(loaded) {
    if (!loaded) {
      try {
        sock.ws.close()
      } catch {}
      try {
        sock.ev.removeAllListeners()
      } catch {}
      let i = global.conns.indexOf(sock)
      if (i < 0) return
      delete global.conns[i]
      global.conns.splice(i, 1)
    }
  }

  async function connectionUpdate(update) {
    const { connection, lastDisconnect, isNewLogin, qr } = update

    if (isNewLogin) sock.isInit = false

    if (qr && !mcode) {
      if (m?.chat) {
        txtQR = await conn.sendMessage(
          m.chat,
          { image: await qrcode.toBuffer(qr, { scale: 8 }), caption: rtx.trim() },
          { quoted: m }
        )
      } else {
        return
      }

      if (txtQR && txtQR.key) {
        setTimeout(() => {
          conn.sendMessage(m.sender, { delete: txtQR.key })
        }, 30000)
      }
      return
    }

    if (qr && mcode && !pairingSent) {
      pairingSent = true
      try {
        let secret = await sock.requestPairingCode(m.sender.split`@`[0])
        secret = secret.match(/.{1,4}/g)?.join('-')
        txtCode = await conn.sendMessage(m.chat, { text: rtx2 }, { quoted: m })
        codeBot = await m.reply(secret)
        console.log(secret)
      } catch (e) {
        pairingSent = false
        try {
          await conn.reply(m.chat, `ꕥ No se pudo generar el código, intenta de nuevo.`, m)
        } catch {}
      }
    }

    if (txtCode && txtCode.key) {
      setTimeout(() => {
        conn.sendMessage(m.sender, { delete: txtCode.key })
      }, 30000)
    }
    if (codeBot && codeBot.key) {
      setTimeout(() => {
        conn.sendMessage(m.sender, { delete: codeBot.key })
      }, 30000)
    }

    const reason = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.output?.payload?.statusCode

    if (connection === 'close') {
      if (reason === 428 || reason === 408) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La conexión (+${path.basename(
              pathYukiJadiBot
            )}) se cerró/perdió. Intentando reconectar...\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        await creloadHandler(true).catch(console.error)
        return
      }

      if (reason === 440) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La conexión (+${path.basename(
              pathYukiJadiBot
            )}) fue reemplazada por otra sesión activa.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        try {
          if (options.fromCommand && m?.chat) {
            await conn.sendMessage(
              `${path.basename(pathYukiJadiBot)}@s.whatsapp.net`,
              { text: '⚠︎ Hemos detectado una nueva sesión, borre la antigua sesión para continuar.\n\n> ☁︎ Si Hay algún problema vuelva a conectarse.' },
              { quoted: m || null }
            )
          }
        } catch {
          console.error(chalk.bold.yellow(`⚠︎ Error 440 no se pudo enviar mensaje a: +${path.basename(pathYukiJadiBot)}`))
        }
        return
      }

      if (reason == 405 || reason == 401) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ La sesión (+${path.basename(
              pathYukiJadiBot
            )}) fue cerrada. Credenciales no válidas o desconectado manualmente.\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        try {
          if (options.fromCommand && m?.chat) {
            await conn.sendMessage(
              `${path.basename(pathYukiJadiBot)}@s.whatsapp.net`,
              { text: '⚠︎ Sesión pendiente.\n\n> ☁︎ Vuelva a intentar nuevamente volver a ser *SUB-BOT*.' },
              { quoted: m || null }
            )
          }
        } catch {
          console.error(chalk.bold.yellow(`⚠︎ Error 405 no se pudo enviar mensaje a: +${path.basename(pathYukiJadiBot)}`))
        }
        try {
          fs.rmSync(pathYukiJadiBot, { recursive: true, force: true })
        } catch {}
        return
      }

      if (reason === 500) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Conexión perdida en la sesión (+${path.basename(
              pathYukiJadiBot
            )}). Reintentando...\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        try {
          if (options.fromCommand && m?.chat) {
            await conn.sendMessage(
              `${path.basename(pathYukiJadiBot)}@s.whatsapp.net`,
              { text: '⚠︎ Conexión perdida.\n\n> ☁︎ Intenté conectarse manualmente para volver a ser *SUB-BOT*' },
              { quoted: m || null }
            )
          }
        } catch {}
        return creloadHandler(true).catch(console.error)
      }

      if (reason === 515) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Reinicio automático para la sesión (+${path.basename(
              pathYukiJadiBot
            )}).\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        await creloadHandler(true).catch(console.error)
        return
      }

      if (reason === 403) {
        console.log(
          chalk.bold.magentaBright(
            `\n╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡\n┆ Sesión cerrada o cuenta en soporte para la sesión (+${path.basename(
              pathYukiJadiBot
            )}).\n╰┄┄┄┄┄┄┄┄┄┄┄┄┄┄ • • • ┄┄┄┄┄┄┄┄┄┄┄┄┄┄⟡`
          )
        )
        try {
          fs.rmSync(pathYukiJadiBot, { recursive: true, force: true })
        } catch {}
        return
      }
    }

    if (global.db?.data == null && typeof global.loadDatabase === 'function') global.loadDatabase()

    if (connection === 'open') {
      if (!global.db?.data?.users && typeof global.loadDatabase === 'function') global.loadDatabase()
      await joinChannels(sock)

      let userName = sock.authState?.creds?.me?.name || 'Anónimo'
      let userJid = sock.authState?.creds?.me?.jid || `${path.basename(pathYukiJadiBot)}@s.whatsapp.net`

      console.log(
        chalk.bold.cyanBright(
          `\n❒⸺⸺⸺⸺【• SUB-BOT •】⸺⸺⸺⸺❒\n│\n│ ❍ ${userName} (+${path.basename(
            pathYukiJadiBot
          )}) conectado exitosamente.\n│\n❒⸺⸺⸺【• CONECTADO •】⸺⸺⸺❒`
        )
      )

      sock.isInit = true

      if (!global.conns.includes(sock)) global.conns.push(sock)

      try {
        if (m?.chat) {
          await conn.sendMessage(
            m.chat,
            {
              text: isSubBotConnected(m.sender)
                ? `@${m.sender.split('@')[0]}, ya estás conectado, leyendo mensajes entrantes...`
                : `❀ Has registrado un nuevo *Sub-Bot!* [@${m.sender.split('@')[0]}]\n\n> Puedes ver la información del bot usando el comando *#infobot*`,
              mentions: [m.sender]
            },
            { quoted: m }
          )
        }
      } catch {}

      setTimeout(() => restartBotProcess(), 800)
    }
  }

  setInterval(async () => {
    if (!sock.user) {
      try {
        sock.ws.close()
      } catch {}
      try {
        sock.ev.removeAllListeners()
      } catch {}
      let i = global.conns.indexOf(sock)
      if (i < 0) return
      delete global.conns[i]
      global.conns.splice(i, 1)
    }
  }, 60000)

  let handlerModule = await import('../handler.js')

  let creloadHandler = async function (restatConn) {
    try {
      const Handler = await import(`../handler.js?update=${Date.now()}`).catch(console.error)
      if (Object.keys(Handler || {}).length) handlerModule = Handler
    } catch (e) {
      console.error('⚠︎ Nuevo error: ', e)
    }

    if (restatConn) {
      const oldChats = sock.chats
      try {
        sock.ws.close()
      } catch {}
      try {
        sock.ev.removeAllListeners()
      } catch {}
      sock = makeWASocket(connectionOptions, { chats: oldChats })
      isInit = true
    }

    if (!isInit) {
      sock.ev.off('messages.upsert', sock.handler)
      sock.ev.off('connection.update', sock.connectionUpdate)
      sock.ev.off('creds.update', sock.credsUpdate)
    }

    sock.handler = handlerModule.handler.bind(sock)
    sock.connectionUpdate = connectionUpdate.bind(sock)
    sock.credsUpdate = saveCreds.bind(sock, true)

    sock.ev.on('messages.upsert', sock.handler)
    sock.ev.on('connection.update', sock.connectionUpdate)
    sock.ev.on('creds.update', sock.credsUpdate)

    isInit = false
    return true
  }

  await creloadHandler(false)
}