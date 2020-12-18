const fs = require('fs')
const { spawn } = require('child_process')
const { v1: uuidv1 } = require('uuid')
const debug = require('debug')('botium-speech-processing-picotts')

const { ttsFilename } = require('../utils')

const voicesList = [
  {
    name: 'en-EN',
    language: 'en',
    gender: 'neutral'
  },
  {
    name: 'en-GB',
    language: 'en',
    gender: 'neutral'
  },
  {
    name: 'es-ES',
    language: 'es',
    gender: 'neutral'
  },
  {
    name: 'de-DE',
    language: 'de',
    gender: 'neutral'
  },
  {
    name: 'en-GB',
    language: 'en',
    gender: 'neutral'
  },
  {
    name: 'fr-FR',
    language: 'fr',
    gender: 'neutral'
  },
  {
    name: 'it-IT',
    language: 'it',
    gender: 'neutral'
  }
]

class PicoTTS {
  async voices () {
    return voicesList
  }

  async tts ({ language, voice, text }) {
    const picoVoice = voicesList.find(v => {
      if (language && v.language !== language) return false
      if (voice && v.name !== voice) return false
      return true
    })
    if (!picoVoice) throw new Error(`Voice <${voice || 'default'}> for language <${language}> not available`)

    return new Promise((resolve, reject) => {
      const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${uuidv1()}.wav`

      const cmdLinePico = `${process.env.BOTIUM_SPEECH_PICO_CMDPREFIX || 'pico2wave'} --lang=${picoVoice.name} --wave=${output}`
      debug(`cmdLinePico: ${cmdLinePico}`)
      const cmdLinePicoParts = cmdLinePico.split(' ')
      const pico = spawn(cmdLinePicoParts[0], cmdLinePicoParts.slice(1).concat([text]))

      pico.once('exit', (code, signal) => {
        debug(`pico2wave process exited with code ${code}, signal ${signal}`)
        if (code === 0) {
          try {
            const outputBuffer = fs.readFileSync(output)
            fs.unlinkSync(output)
            resolve({
              buffer: outputBuffer,
              name: `${ttsFilename(text)}.wav`
            })
          } catch (err) {
            reject(new Error(`pico2wave process output file ${output} not readable: ${err.message}`))
          }
        } else {
          reject(new Error(`pico2wave process exited with code ${code}, signal ${signal}`))
        }
      })
      pico.once('error', (err) => {
        debug(`pico2wave process failed: ${err.message}`)
        reject(new Error(`pico2wave process failed: ${err.message}`))
      })
      pico.stdout.on('error', (err) => {
        debug('stdout err ' + err)
      })
      pico.stderr.on('error', (err) => {
        debug('stderr err ' + err)
      })
      pico.stdin.on('error', (err) => {
        debug('stdin err ' + err)
      })
      pico.stderr.on('data', (data) => {
        debug('stderr ' + data)
      })
    })
  }
}

module.exports = PicoTTS
