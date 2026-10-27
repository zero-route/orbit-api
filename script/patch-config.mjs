import { readFileSync, writeFileSync } from "node:fs";

const file = "app.json";
const json = JSON.parse(readFileSync(file, "utf8"));
const expo = json.expo ?? {};
const projectId = expo.extra?.eas?.projectId;

expo.name = "Orbit";
expo.slug = "orbit-media";
expo.scheme = "orbit";
expo.version = "0.1.0";
expo.orientation = "portrait";
expo.userInterfaceStyle = "dark";
expo.runtimeVersion = { policy: "appVersion" };

if (projectId) {
  expo.updates = {
    url: `https://u.expo.dev/${projectId}`,
    fallbackToCacheTimeout: 0,
  };
}

expo.android = {
  ...(expo.android ?? {}),
  package: process.env.ANDROID_PACKAGE || "com.orbitmedia.app",
};

const wanted = [
  "expo-secure-store",
  [
    "expo-media-library",
    {
      photosPermission: "Orbit perlu akses galeri untuk menyimpan hasil unduhan.",
      savePhotosPermission: "Orbit perlu izin menyimpan hasil unduhan ke galeri.",
      isAccessMediaLocationEnabled: true,
    },
  ],
];

const nameOf = (entry) => (Array.isArray(entry) ? entry[0] : entry);
const kept = (expo.plugins ?? []).filter(
  (entry) => !wanted.some((item) => nameOf(item) === nameOf(entry))
);

expo.plugins = [...kept, ...wanted];
json.expo = expo;

writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
console.log(`app.json diperbarui, projectId: ${projectId ?? "belum ada"}`);
