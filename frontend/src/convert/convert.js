const fs = require('fs')
const Mustache = require('mustache')
const { spawn } = require('child_process')
const { v1: uuidv1 } = require('uuid')
const debug = require('debug')('botium-speech-processing-convert')

const runconvert = (cmdLine, outputFile, { inputBuffer, start, end }) => {
  return new Promise((resolve, reject) => {
    const jobId = uuidv1()

    const output = `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_${outputFile}`
    const input = cmdLine.indexOf('{{{input}}}') >= 0 ? `${process.env.BOTIUM_SPEECH_TMP_DIR || '/tmp'}/${jobId}_input` : null

    if (input) {
      try {
        fs.writeFileSync(input, inputBuffer)
      } catch (err) {
        reject(new Error(`conversion process input file ${input} not writable: ${err.message}`))
      }
    }

    let cmdLineFull = Mustache.render(cmdLine, { output, input })
    if (start && end) {
      cmdLineFull = `${cmdLineFull} trim ${start} ${end}`
    } else if (start && !end) {
      cmdLineFull = `${cmdLineFull} trim ${start}`
    } else if (!start && end) {
      cmdLineFull = `${cmdLineFull} trim 0 ${end}`
    }
    debug(`cmdLineFull: ${cmdLineFull}`)
    const childProcess = spawn('/bin/sh', ['-c', cmdLineFull])

    childProcess.once('exit', (code, signal) => {
      debug(`conversion process exited with code ${code}, signal ${signal}`)
      if (code === 0) {
        try {
          const outputBuffer = fs.readFileSync(output)
          fs.unlinkSync(output)
          resolve(outputBuffer)
        } catch (err) {
          reject(new Error(`conversion process output file ${output} not readable: ${err.message}`))
        }
      } else {
        reject(new Error(`conversion process exited with code ${code}, signal ${signal}`))
      }
      if (input) {
        try {
          fs.unlinkSync(input)
        } catch (err) {
          debug(`conversion process input file ${input} not deleted: ${err.message}`)
        }
      }
    })
    childProcess.once('error', (err) => {
      debug(`conversion process failed: ${err.message}`)
      reject(new Error(`conversion process failed: ${err.message}`))
    })
    childProcess.stdout.on('error', (err) => {
      debug('stdout err ' + err)
    })
    childProcess.stderr.on('error', (err) => {
      debug('stderr err ' + err)
    })
    childProcess.stdin.on('error', (err) => {
      debug('stdin err ' + err)
    })
    childProcess.stderr.on('data', (data) => {
      debug('stderr ' + data)
    })

    if (!input) {
      childProcess.stdin.write(inputBuffer)
    }
    childProcess.stdin.end()
  })
}

module.exports = {
  runconvert
}
