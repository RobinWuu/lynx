plugins {
  id("com.android.library")
}

val lynxPrimjsVersion =
  rootProject.findProperty("lynx.primjs.version")?.toString() ?: "4.+"
val primjsNativeAar by configurations.creating
val primjsNativeAarFiles = primjsNativeAar.incoming.artifactView {}.files
val extractPrimjsNativeLibraries by tasks.registering(Sync::class) {
  from(primjsNativeAarFiles.elements.map { files ->
    files.map { zipTree(it.asFile) }
  })
  include("jni/**/*.so")
  into(layout.buildDirectory.dir("primjs-native"))
}

val opencvNativeAar by configurations.creating
val opencvNativeAarFiles = opencvNativeAar.incoming.artifactView {}.files
val extractOpenCVNativeLibraries by tasks.registering(Sync::class) {
  from(opencvNativeAarFiles.elements.map { files ->
    files.map { zipTree(it.asFile) }
  })
  include("prefab/modules/opencv_java4/include/**")
  include("jni/**/*.so")
  into(layout.buildDirectory.dir("opencv-native"))
}

android {
  javaClass.methods.firstOrNull { it.name == "setNamespace" }
    ?.invoke(this, "com.bytedance.lynx.opencvdocumentscanner")
  compileSdkVersion(35)

  defaultConfig {
    minSdkVersion(23)


    externalNativeBuild {
      cmake {
        arguments(
          "-DLYNX_PRIMJS_JNI_DIR=${layout.buildDirectory.dir("primjs-native/jni").get().asFile.absolutePath}",
          "-DOPENCV_NATIVE_DIR=${layout.buildDirectory.dir("opencv-native").get().asFile.absolutePath}"
        )
      }
    }
  }


  externalNativeBuild {
    cmake {
      path = file("CMakeLists.txt")
      version = "3.18.1"
    }
  }
}

dependencies {
  implementation("org.opencv:opencv:4.9.0")
  opencvNativeAar("org.opencv:opencv:4.9.0@aar")
  implementation("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion")
  primjsNativeAar("org.lynxsdk.lynx:primjs:$lynxPrimjsVersion@aar")
}


tasks.configureEach {
  if (name.startsWith("configureCMake")
      || name.startsWith("generateJsonModel")
      || name.startsWith("externalNativeBuild")) {
    dependsOn(extractPrimjsNativeLibraries)
    dependsOn(extractOpenCVNativeLibraries)
  }
}
