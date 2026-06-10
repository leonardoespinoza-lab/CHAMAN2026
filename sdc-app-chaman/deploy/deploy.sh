buildResult=$(npm run build)
if [ $? -eq 0 ]; then
  echo "Build success"
  echo $buildResult
  gcloud config set project smartium-agro
  gcloud app deploy ../app.yaml --quiet
else
  echo "Build failed"
  echo $buildResult
fi
