export const LAKE_IDS = ["yamanakako", "kawaguchiko", "saiko", "shojiko", "motosuko"] as const;
export type LakeId = (typeof LAKE_IDS)[number];

export type Lake = {
  id: LakeId;
  name: string;
  latitude: number;
  longitude: number;
  candidates: string[];
  fallback: { label: string; url: string };
};

export const LAKES: readonly Lake[] = [
  {
    id: "yamanakako",
    name: "야마나카코",
    latitude: 35.417,
    longitude: 138.875,
    candidates: ["F2NbYrc-gBU"],
    fallback: { label: "山中湖村 絶景ライブカメラ", url: "https://lake-yamanakako.com/zekkei" },
  },
  {
    id: "kawaguchiko",
    name: "가와구치코",
    latitude: 35.504,
    longitude: 138.761,
    candidates: ["bdUbACCWmoY", "1cnReFAU04k"],
    fallback: { label: "富士河口湖町 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=6" },
  },
  {
    id: "saiko",
    name: "사이코",
    latitude: 35.499,
    longitude: 138.685,
    candidates: [],
    fallback: { label: "西湖いやしの里根場 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=1649" },
  },
  {
    id: "shojiko",
    name: "쇼지코",
    latitude: 35.47,
    longitude: 138.61,
    candidates: ["so_3HK9HIdg"],
    fallback: { label: "UTY 精進湖ライブカメラ", url: "https://www.uty.co.jp/livecam/shojiko.php" },
  },
  {
    id: "motosuko",
    name: "모토스코",
    latitude: 35.463,
    longitude: 138.588,
    candidates: ["_qdu714QT1E", "JGyGoXlKZmw"],
    fallback: { label: "ふじやま.TV ライブカメラ一覧", url: "https://fujiyama.tv/live/" },
  },
];

export const SUN_REFERENCE_LAKE: LakeId = "kawaguchiko";
