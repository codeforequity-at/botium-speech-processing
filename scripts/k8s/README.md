##k8s
Some predefined kubernetes workload collection:
 * default: marytts+kaldi (see docker-compose.yaml)
 * google: just google (see docker-compose-google.yaml)
 * picotts picotts+kaldi (see docker-compose-picotts.yaml)
 
To use it: 
 * replace placeholders in a dir
 * deploy it `kubectl apply -R -f default`
 * undeploy it `kubectl delete -R -f default` 

Do not modify and commit directly. Workload files are generated from helm chart!
