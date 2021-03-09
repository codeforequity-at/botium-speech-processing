const fs = require('fs')
const _ = require('lodash')
const sanitize = require('sanitize-filename')
const speechScorer = require('word-error-rate')

const wer = async (text1, text2) => {
  return {
    distance: speechScorer.calculateEditDistance(text1 || '', text2 || ''),
    wer: speechScorer.wordErrorRate(text1 || '', text2 || '')
  }
}

const ttsFilename = (text) => {
  const shortenedText = _.truncate(text, { length: 500 })
  return sanitize(shortenedText) || 'unknown'
}

const cleanEnv = (envName) => {
  return process.env[envName] && process.env[envName].replace(/\\n/g, '\n')
}

const googleOptions = () => {
  const keyFilename = process.env.BOTIUM_SPEECH_GOOGLE_KEYFILE
  if (keyFilename) {
    if (!fs.existsSync(keyFilename)) throw new Error(`Google Cloud credentials file "${keyFilename}" not found`)
    return { keyFilename }
  }
  const privateKey = cleanEnv('BOTIUM_SPEECH_GOOGLE_PRIVATE_KEY')
  const clientEmail = process.env.BOTIUM_SPEECH_GOOGLE_CLIENT_EMAIL
  if (privateKey && clientEmail) {
    return { credentials: { private_key: privateKey, client_email: clientEmail } }
  }
  throw new Error('Google Cloud credentials not found')
}

module.exports = {
  wer,
  ttsFilename,
  googleOptions
}
