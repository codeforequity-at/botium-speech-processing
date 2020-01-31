#!/bin/bash

mkdir -p /app/watch/tts_input_de
mkdir -p /app/watch/tts_input_en
mkdir -p /app/watch/tts_output

inotifywait -m /app/watch/tts_input_de /app/watch/tts_input_en -e close_write |
  while read path action file; do
    if [[ "$path" =~ .*tts_input_de.* ]]; then
      language=de
    elif [[ "$path" =~ .*tts_input_en.* ]]; then
      language=en
    else
      mv -f $path$file /app/watch/tts_output/$file.err_language_not_supported
      continue
    fi
    text=$(cat $path$file)
    curl -s -S -X GET "http://frontend:56000/api/tts/$language" -G --data-urlencode "text=$text" -o /app/watch/tts_output/$file.wav
    if [ $? -ne 0 ]; then
      mv -f $path$file /app/watch/tts_output/$file.err_tts
      continue
    fi
    mv -f $path$file /app/watch/tts_output/$file
  done