#!/bin/bash

mkdir -p /app/watch/stt_input_de
mkdir -p /app/watch/stt_input_en
mkdir -p /app/watch/stt_output
mkdir -p /app/watch/temp

inotifywait -m /app/watch/stt_input_de /app/watch/stt_input_en -e create |
  while read path action file; do
    if [[ "$path" =~ .*stt_input_de$ ]]; then
      language=de
    elif [[ "$file" =~ .*stt_input_en$ ]]; then
      language=en
    fi
    if [[ "$file" =~ .*mp3$ ]]; then
      profile=mp3tomonowav
      contenttype=audio/mp3
    elif [[ "$file" =~ .*wav$ ]]; then
      profile=wavtomonowav
      contenttype=audio/wav
    else
      mv -f $path$file /app/watch/stt_output/$file.err_filetype_not_supported
      continue
    fi
    curl -X POST "http://frontend/api/convert/$profile" -H "Content-Type: $contenttype" -T /app/watch/stt_output/$file -o /app/watch/temp/$file.wav
    if [ $? -ne 0 ]; then
      mv -f $path$file /app/watch/stt_output/$file.err_convert
      rm -f /app/watch/temp/$file.wav
      continue
    fi
    curl -X POST "http://frontend/api/stt/$language" -H "Content-Type: audio/wav" -T /app/watch/temp/$file.wav | jq -r .text > /app/watch/stt_output/$file.txt
    if [ $? -ne 0 ]; then
      mv -f $path$file /app/watch/stt_output/$file.err_stt
      rm -f /app/watch/temp/$file.wav
      continue
    fi
    mv -f $path$file /app/watch/stt_output/$file
    rm -f /app/watch/temp/$file.wav
  done