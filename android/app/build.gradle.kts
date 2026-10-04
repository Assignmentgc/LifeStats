plugins {
    id("com.android.application")
}

fun prop(name: String): String = providers.gradleProperty(name).get()
fun secret(name: String): String? =
    providers.environmentVariable(name).orNull ?: providers.gradleProperty(name).orNull

val twaHost = prop("twaHost")
val launchUrl = "https://$twaHost${prop("twaStartPath")}"
val assetStatements =
    """[{ \"relation\": [\"delegate_permission/common.handle_all_urls\"], """ +
        """\"target\": { \"namespace\": \"web\", \"site\": \"https://$twaHost\" } }]"""

val keystorePath = secret("LIFESTATS_KEYSTORE_PATH")

android {
    namespace = "fun.lifestats.app"
    compileSdk = 36

    defaultConfig {
        applicationId = prop("twaApplicationId")
        minSdk = 23
        targetSdk = 36
        versionCode = prop("twaVersionCode").toInt()
        versionName = prop("twaVersionName")

        manifestPlaceholders["twaHost"] = twaHost
        resValue("string", "launchUrl", launchUrl)
        resValue("string", "assetStatements", assetStatements)
        resValue("string", "providerAuthority", "${prop("twaApplicationId")}.fileprovider")
    }

    buildFeatures {
        resValues = true
    }

    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = secret("LIFESTATS_KEYSTORE_PASSWORD")
                keyAlias = secret("LIFESTATS_KEY_ALIAS")
                keyPassword = secret("LIFESTATS_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.7.3")
}
