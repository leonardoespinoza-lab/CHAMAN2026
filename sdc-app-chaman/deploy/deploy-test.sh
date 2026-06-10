buildResult=$(npm run build-test)
if [ $? -eq 0 ]; then
  echo "Build success"
  echo $buildResult
  gcloud config set project smartium-agro
  gcloud app deploy ../app-test.yaml --quiet
else
  echo "Build failed"
  echo $buildResult
fi
