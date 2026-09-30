export const LAKE_IDS = ["yamanakako", "kawaguchiko", "saiko", "shojiko", "motosuko"] as const;
export type LakeId = (typeof LAKE_IDS)[number];

// 호수별 관측소를 고른 근거는 설계 문서 "기상청 AMeDAS" 절에 있다.
export const OBSERVATION_STATIONS = [
  { id: "49256", name: "야마나카" },
  { id: "49251", name: "가와구치코" },
] as const;
export type StationId = (typeof OBSERVATION_STATIONS)[number]["id"];

export type CameraCandidate = { videoId: string; label: string };

export type CameraCard = {
  name: string;
  candidates: readonly CameraCandidate[];
  fallback: { label: string; url: string } | null;
};

export type Lake = CameraCard & {
  id: LakeId;
  latitude: number;
  longitude: number;
  fallback: { label: string; url: string };
  station: StationId;
};

export const LAKES: readonly Lake[] = [
  {
    id: "yamanakako",
    name: "야마나카코",
    latitude: 35.417,
    longitude: 138.875,
    candidates: [
      { videoId: "F2NbYrc-gBU", label: "야마나카코 호반" },
      { videoId: "WjVH-0qSwOw", label: "후요다이 전망" },
      { videoId: "Gn2CJjzY068", label: "호텔 마운트 후지" },
      { videoId: "uHuFCWkbJtI", label: "야마나카코 파노라마" },
    ],
    fallback: { label: "山中湖村 絶景ライブカメラ", url: "https://lake-yamanakako.com/zekkei" },
    station: "49256",
  },
  {
    id: "kawaguchiko",
    name: "가와구치코",
    latitude: 35.504,
    longitude: 138.761,
    candidates: [
      { videoId: "bdUbACCWmoY", label: "오이시 공원" },
      { videoId: "1cnReFAU04k", label: "가와구치코 호반" },
      { videoId: "eU8A7QQOcso", label: "파노라마 로프웨이 전망대" },
      { videoId: "Sv9hcJ3k5h4", label: "파노라마 로프웨이 (4K)" },
      { videoId: "6sin2Z5WM3I", label: "후지 뷰 호텔" },
      { videoId: "oe7SMLOEQk0", label: "미즈노 호텔" },
      { videoId: "Mak-Zg-fS2s", label: "북쪽 호반" },
      { videoId: "PW6zhYOkunI", label: "가와구치코역 앞" },
    ],
    fallback: { label: "富士河口湖町 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=6" },
    station: "49251",
  },
  {
    id: "saiko",
    name: "사이코",
    latitude: 35.499,
    longitude: 138.685,
    candidates: [],
    fallback: { label: "西湖いやしの里根場 ライブカメラ", url: "https://www.town.fujikawaguchiko.lg.jp/ka/info.php?if_id=1649" },
    station: "49251",
  },
  {
    id: "shojiko",
    name: "쇼지코",
    latitude: 35.47,
    longitude: 138.61,
    candidates: [{ videoId: "so_3HK9HIdg", label: "쇼지코 호반" }],
    fallback: { label: "UTY 精進湖ライブカメラ", url: "https://www.uty.co.jp/livecam/shojiko.php" },
    station: "49251",
  },
  {
    id: "motosuko",
    name: "모토스코",
    latitude: 35.463,
    longitude: 138.588,
    candidates: [
      { videoId: "_qdu714QT1E", label: "모토스코 호반" },
      { videoId: "JGyGoXlKZmw", label: "후지 모토스코 리조트" },
    ],
    fallback: { label: "ふじやま.TV ライブカメラ一覧", url: "https://fujiyama.tv/live/" },
    station: "49251",
  },
];

export const SPOTS: CameraCard = {
  name: "명소",
  candidates: [
    { videoId: "PlybojPy1r4", label: "아라쿠라야마 센겐 공원 · 주레이토" },
    { videoId: "PxzwnWh1dKk", label: "오시노 핫카이" },
    { videoId: "_6nLps25Kws", label: "후지큐 FUJIYAMA 타워" },
    { videoId: "0KMeH_vh0Bk", label: "후지산역 옥상" },
    { videoId: "nh0TUmU-Sko", label: "오시노 닌자 마을" },
    { videoId: "0MLt9Jha2M8", label: "후지요시다 시내" },
  ],
  fallback: null,
};

export const CAMERA_CARDS: readonly CameraCard[] = [...LAKES, SPOTS];

export const SUN_REFERENCE_LAKE: LakeId = "kawaguchiko";
