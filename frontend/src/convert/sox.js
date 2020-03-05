const fs = require('fs')
const Mustache = require('mustache')
const { spawn } = require('child_process')
const uuidv1 = require('uuid/v1')
const debug = require('debug')('botium-speech-processing-convert-sox')

const runsox = (cmdLine, { inputBuffer, start, end }) => {
  return new Promise((resolve, reject) => {
    const output = `/tmp/${uuidv1()}.wav`
    
    let cmdLineSox = Mustache.render(cmdLine, { output })
    if (start && end) {
      cmdLineSox = `${cmdLineSox} trim ${start} ${end}`
    } else if (start && !end) {
      cmdLineSox = `${cmdLineSox} trim ${start}`
    } else if (!start && end) {
      cmdLineSox = `${cmdLineSox} trim 0 ${end}`
    }
    debug(`cmdLineSox: ${cmdLineSox}`)
    const cmdLineSoxParts = cmdLineSox.split(' ')
    const sox = spawn(cmdLineSoxParts[0], cmdLineSoxParts.slice(1))

    sox.once('exit', (code, signal) => {
      debug(`sox process exited with code ${code}, signal ${signal}`)
      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(output)
          fs.unlinkSync(output)
          resolve(outputBuffer)
        } catch (err) {
          reject(new Error(`sox process output file ${output} not readable: ${err.message}`))
        }
      } else {
        reject(new Error(`sox process exited with code ${code}, signal ${signal}`))
      }
    })
    sox.once('error', (err) => {
      debug(`sox process failed: ${err.message}`)
      reject(new Error(`sox process failed: ${err.message}`))
    })
    sox.stdout.on('error', (err) => {
      debug('stdout err ' + err)
    })
    sox.stderr.on('error', (err) => {
      debug('stderr err ' + err)
    })
    sox.stdin.on('error', (err) => {
      debug('stdin err ' + err)
    })
    sox.stderr.on('data', (data) => {
      debug('stderr ' + data)
    })

    sox.stdin.write(inputBuffer)
    sox.stdin.end()
  })
}

module.exports = {
  runsox
}
