#!/usr/bin/env bash
# Сборка APK без Gradle: aapt → javac → d8 (или dx) → zipalign → apksigner.
#
# Инструменты берутся из Android SDK ($ANDROID_HOME) или из пакетов Ubuntu/Debian:
#   sudo apt install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23
#
# Подпись: по умолчанию — отладочный ключ apps/android/debug.keystore (создаётся при первой сборке).
# Для своего постоянного ключа задайте KEYSTORE, KEYSTORE_PASSWORD, KEY_ALIAS и KEY_PASSWORD.
# Обновить установленное приложение можно только APK, подписанным тем же ключом.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
OUT="$HERE/build"
MIN_SDK=24
TARGET_SDK=34
VERSION_NAME="${VERSION_NAME:-$(node -p "require('$ROOT/package.json').version")}"
VERSION_CODE="${VERSION_CODE:-$(git -C "$ROOT" rev-list --count HEAD 2>/dev/null || echo 1)}"

step() { printf '\n▶ %s\n' "$*"; }

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
if [[ -n "$SDK" ]]; then
  BUILD_TOOLS="$SDK/build-tools/${ANDROID_BUILD_TOOLS:-$(ls "$SDK/build-tools" | sort -V | tail -1)}"
  ANDROID_JAR="$SDK/platforms/${ANDROID_PLATFORM:-$(ls "$SDK/platforms" | grep -E '^android-[0-9]+$' | sort -V | tail -1)}/android.jar"
  AAPT="$BUILD_TOOLS/aapt"
  ZIPALIGN="$BUILD_TOOLS/zipalign"
  APKSIGNER="$BUILD_TOOLS/apksigner"
  D8="$BUILD_TOOLS/d8"
  DX=""
else
  ANDROID_JAR="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
  AAPT="$(command -v aapt || true)"
  ZIPALIGN="$(command -v zipalign || true)"
  APKSIGNER="$(command -v apksigner || true)"
  D8="$(command -v d8 || true)"
  DX="$(command -v dalvik-exchange || command -v dx || true)"
fi

for tool in "$AAPT" "$ZIPALIGN" "$APKSIGNER" "$ANDROID_JAR"; do
  [[ -n "$tool" && -e "$tool" ]] || { echo "Не найдено: ${tool:-инструмент Android SDK}. См. комментарий в начале скрипта." >&2; exit 1; }
done
[[ -n "$D8" || -n "$DX" ]] || { echo "Нужен d8 (Android SDK) или dalvik-exchange (пакет Ubuntu)." >&2; exit 1; }
echo "android.jar: $ANDROID_JAR"
echo "версия: $VERSION_NAME ($VERSION_CODE)"

if [[ "${SKIP_WEB_BUILD:-}" != "1" ]]; then
  step "Сборка фронтенда в режиме приложения (без сервера)"
  npm run build:mobile -w @uia/web --prefix "$ROOT"
fi
WEB_DIST="$ROOT/apps/web/dist-mobile"
[[ -f "$WEB_DIST/index.html" ]] || { echo "Нет $WEB_DIST/index.html — соберите фронтенд." >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT/gen" "$OUT/classes" "$OUT/assets"
cp -R "$WEB_DIST" "$OUT/assets/www"
# Service worker и манифест PWA внутри APK не нужны
rm -f "$OUT/assets/www/sw.js" "$OUT/assets/www/manifest.webmanifest"

step "Ресурсы и манифест (aapt)"
"$AAPT" package -f -m \
  -M "$HERE/AndroidManifest.xml" \
  -S "$HERE/res" \
  -A "$OUT/assets" \
  -I "$ANDROID_JAR" \
  -J "$OUT/gen" \
  -F "$OUT/app-unsigned.apk" \
  --min-sdk-version "$MIN_SDK" \
  --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" \
  --version-name "$VERSION_NAME"

step "Компиляция Java"
find "$HERE/src" "$OUT/gen" -name '*.java' > "$OUT/sources.txt"
javac -source 8 -target 8 -encoding UTF-8 -Xlint:-options \
  -bootclasspath "$ANDROID_JAR" \
  -d "$OUT/classes" @"$OUT/sources.txt"
(cd "$OUT/classes" && jar cf "$OUT/classes.jar" .)

step "Байткод Dalvik"
if [[ -n "$D8" ]]; then
  "$D8" --release --min-api "$MIN_SDK" --lib "$ANDROID_JAR" --output "$OUT" "$OUT/classes.jar"
else
  "$DX" --dex --min-sdk-version="$MIN_SDK" --output="$OUT/classes.dex" "$OUT/classes.jar"
fi
(cd "$OUT" && "$AAPT" add app-unsigned.apk classes.dex > /dev/null)

step "Выравнивание и подпись"
"$ZIPALIGN" -f -p 4 "$OUT/app-unsigned.apk" "$OUT/app-aligned.apk"

if [[ -z "${KEYSTORE:-}" ]]; then
  KEYSTORE="$HERE/debug.keystore"
  export KEYSTORE_PASSWORD=android KEY_PASSWORD=android
  KEY_ALIAS=uia
  if [[ ! -f "$KEYSTORE" ]]; then
    keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KEYSTORE_PASSWORD" -keypass "$KEY_PASSWORD" \
      -alias "$KEY_ALIAS" -keyalg RSA -keysize 2048 -validity 10000 \
      -dname "CN=Taxi All-in-One (debug)" 2> /dev/null
    echo "Создан отладочный ключ $KEYSTORE"
  fi
fi
: "${KEYSTORE_PASSWORD:?Задайте KEYSTORE_PASSWORD}"
export KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"

APK="$OUT/taxi-all-in-one-$VERSION_NAME.apk"
"$APKSIGNER" sign \
  --ks "$KEYSTORE" --ks-pass env:KEYSTORE_PASSWORD \
  --ks-key-alias "${KEY_ALIAS:?Задайте KEY_ALIAS}" --key-pass env:KEY_PASSWORD \
  --out "$APK" "$OUT/app-aligned.apk"
"$APKSIGNER" verify "$APK"

step "Готово: $APK ($(du -h "$APK" | cut -f1))"
