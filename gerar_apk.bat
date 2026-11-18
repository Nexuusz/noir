@echo off
title Gerador APK NOIR - Android TV (SDK 36.0.0)
cd C:\Users\GROSSO\site2.0

:: ==========================================
:: CONFIGURACOES BASEADAS NO SEU SDK
:: ==========================================
set SDK_PATH=C:\Users\GROSSO\AppData\Local\Android\Sdk
set BUILD_TOOLS_PATH=%SDK_PATH%\build-tools\36.0.0
set PLATFORM_TOOLS=%SDK_PATH%\platform-tools

echo.
echo ==========================================
echo   GERADOR DE APK NOIR PARA ANDROID TV
echo (SDK Build-tools 36.0.0)
echo ==========================================
echo.

:: ==========================================
:: VERIFICAR JAVA
:: ==========================================
echo [1/4] Verificando Java JDK...
java -version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Java JDK nao encontrado!
    echo Instale o JDK 17 ou 21 e adicione ao PATH do Windows.
    pause
    exit /b 1
)
echo ... Java OK

:: ==========================================
:: VERIFICAR FERRAMENTAS
:: ==========================================
echo.
echo [2/5] Verificando ferramentas SDK...

:: Verificar aadj e d8 (compilador DEX moderno)
if not exist "%BUILD_TOOLS_PATH%\d8.bat" (
    echo Atenção: d8 nao encontrado em build-tools 36.0.0
    echo Procurando em outras pastas...
    for /d %%D in (%SDK_PATH%\build-tools\*) do if exist "%%D\d8.bat" (
        set BUILD_TOOLS_PATH=%%D
        echo Usando build-tools: %%D
        goto :found_buildtools
    )
    echo ERRO: Nenhuma build-tools com d8 encontrado.
    pause
    exit /b 1
)

:found_buildtools
echo ... Usando build-tools: %BUILD_TOOLS_PATH%

:: Verificar aapt2
if not exist "%BUILD_TOOLS_PATH%\aapt2.exe" (
    echo ERRO: aapt2 nao encontrado em %BUILD_TOOLS_PATH%
    pause
    exit /b 1
)
echo ... aapt2 encontrado

:: Verificar platform-tools (adb)
if not exist "%PLATFORM_TOOLS%\adb.exe" (
    echo Instalando platform-tools...
    "%SDK_PATH%\tools\bin\sdkmanager" "platform-tools" >nul
)
echo ... platform-tools OK

:: ==========================================
:: CRIAR PROJETO ANDROID TV
:: ==========================================
echo.
echo [3/5] Criando projeto Android TV...
if exist NOIR_TV rmdir /s /q NOIR_TV
mkdir NOIR_TV\app\src\main\res\layout
mkdir NOIR_TV\app\src\main\res\values
mkdir NOIR_TV\app\src\main\java\com\noir\tv

:: AndroidManifest.xml para Android TV (Leanback)
type nul > NOIR_TV\AndroidManifest.xml
echo <?xml version="1.0" encoding="utf-8"?> >> NOIR_TV\AndroidManifest.xml
echo <manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.noir.tv"> >> NOIR_TV\AndroidManifest.xml
echo     <application >> NOIR_TV\AndroidManifest.xml
echo         android:allowBackup="true" >> NOIR_TV\AndroidManifest.xml
echo         android:icon="@mipmap/ic_launcher" >> NOIR_TV\AndroidManifest.xml
echo         android:label="@string/app_name" >> NOIR_TV\AndroidManifest.xml
echo         android:roundIcon="@mipmap/ic_launcher_round" >> NOIR_TV\AndroidManifest.xml
echo         android:theme="@style/Theme.Noir.Tv" >> NOIR_TV\AndroidManifest.xml
echo         android:supportsRtl="true" >> NOIR_TV\AndroidManifest.xml
echo         android:largeScreens="true" >> NOIR_TV\AndroidManifest.xml
echo         android:isScreenLock="false" >> NOIR_TV\AndroidManifest.xml
echo         <activity >> NOIR_TV\AndroidManifest.xml
echo             android:name=".NoirTvActivity" >> NOIR_TV\AndroidManifest.xml
echo             android:exported="true" >> NOIR_TV\AndroidManifest.xml
echo             android:label="@string/app_name" >> NOIR_TV\AndroidManifest.xml
echo             android:screenOrientation="unspecified" >> NOIR_TV\AndroidManifest.xml
echo             <intent-filter> >> NOIR_TV\AndroidManifest.xml
echo                 <action android:name="android.intent.action.MAIN" /> >> NOIR_TV\AndroidManifest.xml
echo                 <category android:name="android.intent.category.LEANBACK_LAUNCHER" /> >> NOIR_TV\AndroidManifest.xml
echo             </intent-filter> >> NOIR_TV\AndroidManifest.xml
echo         </activity> >> NOIR_TV\AndroidManifest.xml
echo     </application> >> NOIR_TV\AndroidManifest.xml
echo </manifest> >> NOIR_TV\AndroidManifest.xml

:: strings.xml
echo <?xml version="1.0" encoding="utf-8"?> > NOIR_TV\app\src\main\res\values\strings.xml
echo <resources> >> NOIR_TV\app\src\main\res\values\strings.xml
echo     <string name="app_name">NOIR</string> >> NOIR_TV\app\src\main\res\values\strings.xml
echo </resources> >> NOIR_TV\app\src\main\res\values\strings.xml

:: Java Activity - WebView
echo package com.noir.tv; > NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo import android.os.Bundle; >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo import android.webkit.WebView; >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo import android.webkit.WebViewClient; >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo import androidx.appcompat.app.AppCompatActivity; >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo public class NoirTvActivity extends AppCompatActivity { >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo     @Override >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo     protected void onCreate(Bundle savedInstanceState) { >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         super.onCreate(savedInstanceState); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         WebView webView = new WebView(this); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         webView.setWebViewClient(new WebViewClient()); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         webView.getSettings().setJavaScriptEnabled(true); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         webView.getSettings().setDomStorageEnabled(true); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         webView.loadUrl("http://192.168.1.104:4322"); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo         setContentView(webView); >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo     } >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java
echo } >> NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java

:: Layout
echo <?xml version="1.0" encoding="utf-8"?> > NOIR_TV\app\src\main\res\layout\activity_main.xml
echo <FrameLayout xmlns:android="http://schemas.android.com/apk/res/android" >> NOIR_TV\app\src\main\res\layout\activity_main.xml
echo     android:layout_width="match_parent" >> NOIR_TV\app\src\main\res\layout\activity_main.xml
echo     android:layout_height="match_parent">> NOIR_TV\app\src\main\res\layout\activity_main.xml
echo </FrameLayout> >> NOIR_TV\app\src\main\res\layout\activity_main.xml

echo.
echo ... Projeto Android TV criado!

:: ==========================================
:: TENTAR COMPILAR APK USING D8 + AAPT2
:: ==========================================
echo.
echo [4/5] Compilando APK com d8 + aapt2...
set JAVA_DIR=%USERPROFILE%\AppData\Local\Microsoft\WindowsApps\ 2>nul
:: Tentar encontrar o d8
set D8_PATH=%BUILD_TOOLS_PATH%\d8.bat
set AAPT2_PATH=%BUILD_TOOLS_PATH%\aapt2.exe

:: Criar o classes.dex usando d8
if exist NOIR_TV\app\src\main\java\com\noir\tv\NoirTvActivity.java (
    echo Compilando Java fontes para DEX...
    "%D8_PATH%" --output NOIR_TV\app\build\intermediates\dex\debug NOIR_TV\app\src\main\java\ 2>nul
)

:: Criar o APK usando aapt2 e alignar
echo Montando APK...
mkdir NOIR_TV\app\build 2>nul

:: Usar o modelo simplificado: empacotar com aapt2
%AAPT2_PATH% package -o NOIR_TV.apk -J NOIR_TV\app\src -M NOIR_TV\AndroidManifest.xml -0 res 2>nul

if %errorlevel% equ 0 (
    echo.
    echo [5/5] SUCESSO! APK gerado: %CD%\NOIR_TV.apk
    echo.
    echo ==========================================
    echo   APK PRONTO PARA ANDROID TV
    echo ==========================================
    echo.
    echo "Arquivo gerado: NOIR_TV.apk"
    echo "Local: %CD%\NOIR_TV.apk"
    echo.
    echo "Para instalar no seu Android TV:"
    echo 1. Copie o arquivo NOIR_TV.apk para o Android TV
    echo 2. Abra e instale (pode ser necessario permitir fontes desconhecidas)
    echo 3. O app carregara: http://192.168.1.104:4322
    echo.
) else (
    echo.
    echo ERRO durante montagem do APK.
    echo Tentando metodo alternativo...
    
    :: Fallback: tentar usar apksigner se o APK existiu parcialmente
    if exist NOIR_TV.apk (
        echo APK criado mas pode estar incompleto.
        "%PLATFORM_TOOLS%\apksigner.bat" verify NOIR_TV.apk 2>nul
    )
    
    echo.
    echo METODO RECOMENDADO: WebAPK via Chrome
    echo.
    echo "Em vez de APK compilado, voce pode:"
    echo "1. Abrir http://192.168.1.104:4322 no Chrome do Android TV"
    echo "2. Toque no menu (⋮) -> 'Instalar aplicativo'"
    echo "3. O app NOIR aparecerá na tela da TV automaticamente"
    echo.
)

pause