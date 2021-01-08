const fs = require('fs')
const path = require('path')
const mkdirp = require('mkdirp')
const crypto = require('crypto')
const express = require('express')
const sanitize = require('sanitize-filename')
const { runconvert } = require('./convert/convert')
const { wer } = require('./utils')
const debug = require('debug')('botium-speech-processing-routes')

const cachePathStt = process.env.BOTIUM_SPEECH_CACHE_DIR && path.join(process.env.BOTIUM_SPEECH_CACHE_DIR, 'stt')
const cachePathTts = process.env.BOTIUM_SPEECH_CACHE_DIR && path.join(process.env.BOTIUM_SPEECH_CACHE_DIR, 'tts')
const cacheKeyStt = (data, language, ext) => sanitize(`${crypto.createHash('md5').update(data).digest('hex')}_${language}${ext}`)
const cacheKeyTts = (data, language, voice, ext) => sanitize(`${crypto.createHash('md5').update(data).digest('hex')}_${language}_${voice || 'default'}${ext}`)

if (cachePathStt) mkdirp.sync(cachePathStt)
if (cachePathTts) mkdirp.sync(cachePathTts)

if (process.env.BOTIUM_SPEECH_TMP_DIR) {
  mkdirp.sync(process.env.BOTIUM_SPEECH_TMP_DIR)
}

const ttsEngines = {
  google: new (require('./tts/google'))(),
  marytts: new (require('./tts/marytts'))(),
  picotts: new (require('./tts/picotts'))()
}
const sttEngines = {
  google: new (require('./stt/google'))(),
  kaldi: new (require('./stt/kaldi'))()
}

const router = express.Router()

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     ApiKeyAuth:
 *       type: apiKey
 *       in: header
 *       name: BOTIUM_API_TOKEN
 */

/**
 * @swagger
 * /api/status:
 *   get:
 *     description: Returns Botium Speech Processing Status
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Botium Speech Processing Status
 *         schema:
 *           properties:
 *             status:
 *               type: string
 *               enum: [OK, UNAVAILABLE]
 */
router.get('/api/status', (req, res) => {
  res.json({ status: 'OK' })
})

/**
 * @swagger
 * /api/sttlanguages:
 *   get:
 *     description: Get list of STT languages
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: stt
 *         description: Speech-to-text backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [kaldi, google]
 *     responses:
 *       200:
 *         description: List of supported STT languages
 *         schema:
 *           type: array
 *           items:
 *             type: string
 */
router.get('/api/sttlanguages', async (req, res, next) => {
  try {
    const stt = sttEngines[(req.query.stt && sanitize(req.query.stt)) || process.env.BOTIUM_SPEECH_PROVIDER_STT]
    res.json(await stt.languages())
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/stt/{language}:
 *   post:
 *     description: Convert audio file to text
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: language
 *         description: Language code (as returned from sttlanguages endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: hint
 *         description: Hint text for calculating the Levenshtein edit distance for the result text (word error rate)
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: stt
 *         description: Speech-to-text backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [kaldi, google]
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Extracted text
 *         schema:
 *           properties:
 *             text:
 *               type: string
 */
router.post('/api/stt/:language', async (req, res, next) => {
  if (Buffer.isBuffer(req.body)) {
    let cacheFile = null
    if (cachePathStt) {
      cacheFile = path.join(cachePathStt, cacheKeyStt(req.body, req.params.language, '.json'))
      if (fs.existsSync(cacheFile)) {
        try {
          const result = JSON.parse(fs.readFileSync(cacheFile).toString())
          debug(`Reading stt result ${cacheFile} from cache: ${result.text}`)
          return res.json(result).end()
        } catch (err) {
          debug(`Failed reading stt result ${cacheFile} from cache: ${err.message}`)
        }
      }
    }
    try {
      const stt = sttEngines[(req.query.stt && sanitize(req.query.stt)) || process.env.BOTIUM_SPEECH_PROVIDER_STT]

      const result = await stt.stt({
        language: req.params.language,
        buffer: req.body
      })
      if (req.query.hint) {
        result.wer = await wer(req.query.hint, result.text)
      }
      res.json(result).end()

      if (cachePathStt) {
        try {
          fs.writeFileSync(cacheFile, JSON.stringify(result))
          debug(`Writing stt result ${cacheFile} to cache: ${result.text}`)
        } catch (err) {
          debug(`Writing stt result ${cacheFile} to cache: ${result.text} - failed: ${err.message}`)
        }
      }
    } catch (err) {
      return next(err)
    }
  } else {
    next(new Error('req.body is not a buffer'))
  }
})

/**
 * @swagger
 * /api/ttsvoices:
 *   get:
 *     description: Get list of voices
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, marytts, picotts]
 *     responses:
 *       200:
 *         description: List of supported voices
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               language:
 *                 type: string
 *               gender:
 *                 type: [male, female, neutral]
 */
router.get('/api/ttsvoices', async (req, res, next) => {
  try {
    const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]
    res.json(await tts.voices())
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/ttslanguages:
 *   get:
 *     description: Get list of TTS languages
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, marytts, picotts]
 *     responses:
 *       200:
 *         description: List of supported TTS languages
 *         schema:
 *           type: array
 *           items:
 *             type: string
 */
router.get('/api/ttslanguages', async (req, res, next) => {
  try {
    const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]
    res.json(await tts.languages())
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/tts/{language}:
 *   get:
 *     description: Convert text file to audio
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - audio/wav
 *     parameters:
 *       - name: language
 *         description: Language code (as returned from ttslanguages endpoint)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: text
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: voice
 *         description: Voice name
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *       - name: tts
 *         description: Text-to-speech backend
 *         in: query
 *         required: false
 *         schema:
 *           type: string
 *           enum: [google, marytts, picotts]
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/wav:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/api/tts/:language', async (req, res, next) => {
  if (req.query.text) {
    let cacheFileName = null
    let cacheFileBuffer = null
    if (cachePathTts) {
      cacheFileName = path.join(cachePathTts, cacheKeyTts(req.query.text, req.params.language, req.query.voice, '.txt'))
      cacheFileBuffer = path.join(cachePathTts, cacheKeyTts(req.query.text, req.params.language, req.query.voice, '.bin'))
      if (fs.existsSync(cacheFileName) && fs.existsSync(cacheFileBuffer)) {
        try {
          const name = fs.readFileSync(cacheFileName).toString()
          const buffer = fs.readFileSync(cacheFileBuffer)
          debug(`Reading tts result ${cacheFileName} from cache: ${name}`)
          res.writeHead(200, {
            'Content-disposition': `attachment; filename="${name}"`,
            'Content-Length': buffer.length
          })
          return res.end(buffer)
        } catch (err) {
          debug(`Failed reading tts result ${cacheFileName} from cache: ${err.message}`)
        }
      }
    }
    try {
      const tts = ttsEngines[(req.query.tts && sanitize(req.query.tts)) || process.env.BOTIUM_SPEECH_PROVIDER_TTS]

      const { buffer, name } = await tts.tts({
        language: req.params.language,
        voice: req.query.voice,
        text: req.query.text
      })
      res.writeHead(200, {
        'Content-disposition': `attachment; filename="${name}"`,
        'Content-Length': buffer.length
      })
      res.end(buffer)

      if (cachePathTts) {
        try {
          fs.writeFileSync(cacheFileName, name)
          fs.writeFileSync(cacheFileBuffer, buffer)
          debug(`Writing tts result ${cacheFileName} to cache: ${name}`)
        } catch (err) {
          debug(`Writing tts result ${cacheFileName} to cache: ${name} - failed: ${err.message}`)
        }
      }
    } catch (err) {
      return next(err)
    }
  } else {
    next(new Error('req.query.text empty'))
  }
})

/**
 * @swagger
 * /api/convertprofiles:
 *   get:
 *     description: Get list of audio conversion profile
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: List of supported audio conversion profiles
 *         schema:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 */
router.get('/api/convertprofiles', async (req, res, next) => {
  const keys = Object.keys(process.env).filter(e => e.startsWith('BOTIUM_SPEECH_CONVERT_PROFILE_') && e.endsWith('_CMD')).map(e => e.split('_')[4])
  return res.json(keys.map(key => ({
    name: key,
    description: process.env[`BOTIUM_SPEECH_CONVERT_PROFILE_${key}_DESC`] || ''
  })))
})

/**
 * @swagger
 * /api/convert/{profile}:
 *   post:
 *     description: Convert audio file
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - audio/*
 *     parameters:
 *       - name: profile
 *         description: Conversion profile (for example WAVTOMONOWAV, MP3TOMONOWAV)
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *       - name: start
 *         description: Start Timecode within audio stream (01:32)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *       - name: end
 *         description: End Timecode within audio stream (02:48)
 *         in: query
 *         schema:
 *           type: string
 *           pattern: '^([0-5][0-9]):([0-5][0-9])$'
 *     requestBody:
 *       description: Audio file
 *       content:
 *         audio/wav:
 *           schema:
 *             type: string
 *             format: binary
 *     responses:
 *       200:
 *         description: Audio file
 *         content:
 *           audio/*:
 *             schema:
 *               type: string
 *               format: binary
 */
router.post('/api/convert/:profile', async (req, res, next) => {
  if (!Buffer.isBuffer(req.body)) {
    return next(new Error('req.body is not a buffer'))
  }
  const envVarCmd = `BOTIUM_SPEECH_CONVERT_PROFILE_${req.params.profile.toUpperCase()}_CMD`
  if (!process.env[envVarCmd]) {
    return next(new Error(`Environment variable ${envVarCmd} empty`))
  }
  const envVarOutput = `BOTIUM_SPEECH_CONVERT_PROFILE_${req.params.profile.toUpperCase()}_OUTPUT`

  try {
    const { outputName, outputBuffer } = await runconvert(process.env[envVarCmd], process.env[envVarOutput], { inputBuffer: req.body, start: req.query.start, end: req.query.end })
    res.writeHead(200, {
      'Content-disposition': `attachment; filename="${outputName}"`,
      'Content-Length': outputBuffer.length
    })
    res.end(outputBuffer)
  } catch (err) {
    return next(err)
  }
})

/**
 * @swagger
 * /api/wer:
 *   get:
 *     description: Calculate Levenshtein edit distance between two strings (word error rate)
 *     security:
 *       - ApiKeyAuth: []
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: text1
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *       - name: text2
 *         description: Text
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Levenshtein Edit Distance on word level
 *         schema:
 *           properties:
 *             distance:
 *               type: integer
 *             wer:
 *               type: number
 */
router.get('/api/wer', async (req, res) => {
  res.json(await wer(req.query.text1, req.query.text2))
})

module.exports = router
