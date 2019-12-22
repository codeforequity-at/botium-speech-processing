const fs = require('fs')
const Mustache = require('mustache')
const { spawn } = require('child_process')
const uuidv1 = require('uuid/v1')
const debug = require('debug')('botium-speech-processing-picotts')

class PicoTTS {
  build () {
  }

  async tts ({ language, text }) {
    const envVarCmd = `BOTIUM_SPEECH_PICO_CMDPREFIX_${language.toUpperCase()}`
    if (!process.env[envVarCmd]) throw new Error(`Environment variable ${envVarCmd} empty`)

    return new Promise((resolve, reject) => {
      const output = `/tmp/${uuidv1()}.wav`

      const cmdLinePico = Mustache.render(process.env[envVarCmd], { output })
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
              name: 'tts.wav'
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
