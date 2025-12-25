import fetch from "node-fetch"
import yts from "yt-search"

const handler = async (m, { conn, text, usedPrefix, command }) => {
  try {
    if (!text?.trim())
      return conn.reply(m.chat, `❀ Por favor, ingresa el nombre de la música a descargar.`, m)

    await m.react("🕒")

    const videoMatch = text.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([a-zA-Z0-9_-]{11})/
    )
    const query = videoMatch ? "https://youtu.be/" + videoMatch[1] : text

    const search = await yts(query)
    const result = videoMatch
      ? search.videos.find(v => v.videoId === videoMatch[1]) || search.all?.[0]
      : search.all?.[0]

    if (!result) throw "ꕥ No se encontraron resultados."

    const { title, thumbnail, url, author, seconds } = result
    if (seconds > 2700) throw "⚠ El contenido supera el límite de duración (45 minutos)."

    const isAudio = ["play", "yta", "ytmp3", "playaudio"].includes(command)
    const isVideo = ["play2", "ytv", "ytmp4", "mp4"].includes(command)

    let media = null
    if (isAudio) {
      media = await getAud(url)
      if (!media?.url) throw "⚠ No se pudo obtener el audio."
    } else if (isVideo) {
      media = await getVid(url)
      if (!media?.url) throw "⚠ No se pudo obtener el video."
    }

    const duracion = formatDuration(seconds)
    const calidad = isVideo ? "360p" : "128kbps"
    const tamano = media?.url ? await getRemoteSize(media.url) : "No disponible"

    const info =
      `「✦」Descargando *<${title}>*\n\n` +
      `> ✐ Canal » *${author?.name || "Desconocido"}*\n` +
      `> ⴵ Duracion » *${duracion}*\n` +
      `> ✰ Calidad: *${calidad}*\n` +
      `> ❒ API » *Adonix*\n` +
      `> 🜸 Link » ${url}`

    const thumb = (await conn.getFile(thumbnail)).data
    await conn.sendMessage(m.chat, { image: thumb, caption: info }, { quoted: m })

    if (isAudio) {
      if (command === "ytmp3") {
        await conn.sendMessage(
          m.chat,
          { audio: { url: media.url }, fileName: `${title}.mp3`, mimetype: "audio/mpeg" },
          { quoted: m }
        )
      } else {
        await conn.sendMessage(
          m.chat,
          {
            document: { url: media.url },
            fileName: `${title}.mp3`,
            mimetype: "audio/mpeg",
            caption: ``
          },
          { quoted: m }
        )
      }
      await m.react("✔️")
      return
    }

    if (isVideo) {
      if (command === "ytmp4") {
        await conn.sendMessage(
          m.chat,
          { video: { url: media.url }, mimetype: "video/mp4", caption: `` },
          { quoted: m }
        )
      } else {
        await conn.sendMessage(
          m.chat,
          {
            document: { url: media.url },
            fileName: `${title}.mp4`,
            mimetype: "video/mp4",
            caption: ``
          },
          { quoted: m }
        )
      }
      await m.react("✔️")
      return
    }
  } catch (e) {
    await m.react("✖️")
    return conn.reply(
      m.chat,
      typeof e === "string"
        ? e
        : "⚠︎ Se ha producido un problema.\n> Usa *" +
            usedPrefix +
            "report* para informarlo.\n\n" +
            (e?.message || e),
      m
    )
  }
}

handler.command = handler.help = ["play", "yta", "ytmp3", "play2", "ytv", "ytmp4", "mp4"]
handler.tags = ["descargas"]
handler.group = true

export default handler

async function getAud(url) {
  const endpoint = `${global.APIs.adonix.url}/download/ytaudio?apikey=${global.APIs.adonix.key}&url=${encodeURIComponent(
    url
  )}`
  const res = await fetchJson(endpoint)
  const link = res?.data?.url
  return link ? { url: link, api: "Adonix" } : null
}

async function getVid(url) {
  const endpoint = `${global.APIs.adonix.url}/download/ytvideo?apikey=${global.APIs.adonix.key}&url=${encodeURIComponent(
    url
  )}`
  const res = await fetchJson(endpoint)
  const link = res?.data?.url
  return link ? { url: link, api: "Adonix" } : null
}

async function fetchJson(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const r = await fetch(url, { signal: controller.signal })
    return await r.json()
  } finally {
    clearTimeout(timeout)
  }
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds)) return "No disponible"
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = Math.floor(totalSeconds % 60)

  if (h > 0) return `${h} horas ${m} minutos ${s} segundos`
  return `${m} minutos ${s} segundos`
}

async function getRemoteSize(fileUrl) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    const r = await fetch(fileUrl, { method: "HEAD", signal: controller.signal })
    clearTimeout(timeout)
    const len = r.headers.get("content-length")
    if (!len) return "No disponible"
    return formatBytes(Number(len))
  } catch {
    return "No disponible"
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "No disponible"
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(2)}${units[i]}`
}

function formatViews(views) {
  if (views === undefined) return "No disponible"
  if (views >= 1_000_000_000) return `${(views / 1_000_000_000).toFixed(1)}B (${views.toLocaleString()})`
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M (${views.toLocaleString()})`
  if (views >= 1_000) return `${(views / 1_000).toFixed(1)}k (${views.toLocaleString()})`
  return views.toString()
}