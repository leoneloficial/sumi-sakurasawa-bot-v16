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

    const isAudio = command === "playaudio"
    const isVideo = command === "playvideo"

    let media = null
    if (isAudio) {
      media = await getAud(url)
      if (!media?.url) throw "⚠ No se pudo obtener el audio."
    } else if (isVideo) {
      media = await getVid(url)
      if (!media?.url) throw "⚠ No se pudo obtener el video."
    } else {
      return
    }

    const duracion = formatDuration(seconds)
    const calidad = isVideo ? "360p" : "128kbps"

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
      const audioBuffer = await downloadBuffer(media.url)
      if (!audioBuffer) throw "⚠ No se pudo descargar el audio (buffer)."

      await conn.sendMessage(
        m.chat,
        {
          audio: audioBuffer,
          mimetype: "audio/mpeg",
          fileName: `${title}.mp3`,
          ptt: true
        },
        { quoted: m }
      )

      await m.react("✔️")
      return
    }

    if (isVideo) {
      await conn.sendMessage(
        m.chat,
        { video: { url: media.url }, mimetype: "video/mp4", caption: "" },
        { quoted: m }
      )
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

handler.command = handler.help = ["playaudio", "playvideo"]
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

async function downloadBuffer(fileUrl) {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60000)
    const r = await fetch(fileUrl, { signal: controller.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const ab = await r.arrayBuffer()
    clearTimeout(timeout)
    return Buffer.from(ab)
  } catch {
    return null
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