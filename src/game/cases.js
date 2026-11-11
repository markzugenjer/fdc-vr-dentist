/**
 * The treatments. Each step needs one tool; the step text says WHAT to do, not which tool, so the
 * player has to know (the assistant gives a hint after a mistake).
 * `time` = seconds of work with the right tool in the mouth.
 *
 * To add a treatment: add an entry here and its mouth visuals in mouth.js.
 */
export const CASES = {
  scaling: {
    title: 'Scaling karang gigi',
    complaints: ['Gigiku kuning dan ada karangnya, Dokter!', 'Kata temanku napasku bau... tolong, Dokter!', 'Gusiku suka berdarah kalau sikat gigi.'],
    steps: [
      { tool: 'mirror', text: 'Periksa gigi pasien', time: 1.2 },
      { tool: 'scaler', text: 'Bersihkan karang gigi', time: 3.2 },
      { tool: 'suction', text: 'Sedot air dan sisa karang', time: 1.6 },
    ],
  },
  extraction: {
    title: 'Cabut gigi',
    complaints: ['Gigiku goyang dan sakit sekali...', 'Gigi bawahku goyang, Dokter. Takut!', 'Ada gigi yang sudah rusak, Dokter.'],
    steps: [
      { tool: 'syringe', text: 'Bius dulu supaya tidak sakit', time: 1.4 },
      { tool: 'forceps', text: 'Cabut gigi yang goyang', time: 2.4 },
      { tool: 'gauze', text: 'Tahan darah di bekas cabutan', time: 1.3 },
    ],
  },
  filling: {
    title: 'Tambal gigi',
    complaints: ['Ada lubang di gigiku, ngilu kalau minum es!', 'Gigi atasku berlubang, Dokter.', 'Kalau makan manis, gigiku cenat-cenut!'],
    steps: [
      { tool: 'mirror', text: 'Cari gigi yang berlubang', time: 1.2 },
      { tool: 'drill', text: 'Bersihkan lubang gigi', time: 2.6 },
      { tool: 'filling', text: 'Isi lubang dengan tambalan', time: 1.8 },
      { tool: 'light', text: 'Keraskan tambalan', time: 1.6 },
    ],
  },
  whitening: {
    title: 'Pemutihan gigi',
    complaints: ['Gigiku kuning gara-gara kopi, Dokter!', 'Mau foto prewedding, gigi harus putih!', 'Kebanyakan minum teh nih, Dokter...'],
    steps: [
      { tool: 'mirror', text: 'Periksa warna gigi', time: 1.2 },
      { tool: 'gel', text: 'Oleskan gel pemutih di tiap gigi', time: 3.0 },
      { tool: 'light', text: 'Sinari gelnya', time: 1.8 },
      { tool: 'suction', text: 'Bilas dan sedot gelnya', time: 1.6 },
    ],
  },
  braces: {
    title: 'Pasang behel',
    complaints: ['Gigiku berantakan, mau pakai behel!', 'Mau behel warna-warni, Dokter!', 'Gigi depanku maju, Dokter...'],
    steps: [
      { tool: 'mirror', text: 'Periksa susunan gigi', time: 1.2 },
      { tool: 'bracket', text: 'Tempel bracket satu per satu', time: 3.0 },
      { tool: 'light', text: 'Keraskan lem bracket', time: 1.5 },
      { tool: 'wire', text: 'Pasang kawatnya', time: 2.0 },
    ],
  },
  rootcanal: {
    title: 'Perawatan saluran akar',
    complaints: ['Gigiku nyut-nyutan sampai ke kepala!', 'Sakit banget kalau kena air panas, Dokter...', 'Gigiku bengkak, Dokter. Tolong!'],
    steps: [
      { tool: 'xray', text: 'Cek foto rontgen di layar', time: 1.0 },
      { tool: 'syringe', text: 'Bius dulu supaya tidak sakit', time: 1.4 },
      { tool: 'drill', text: 'Buka gigi yang sakit', time: 2.2 },
      { tool: 'file', text: 'Bersihkan saluran akar (ikuti irama!)', time: 3.0, rhythm: true },
      { tool: 'filling', text: 'Tutup dengan tambalan', time: 1.6 },
    ],
  },
  checkup: {
    title: 'Cek gigi anak',
    kidsOnly: true,
    complaints: ['Mama bilang aku harus periksa gigi!', 'Aku sudah sikat gigi lho, Dokter!', 'Gigiku ada yang goyang, hihi.'],
    steps: [
      { tool: 'mirror', text: 'Hitung giginya', time: 2.4 },
      { tool: 'gel', text: 'Oles fluoride rasa stroberi', time: 2.4 },
      { tool: 'suction', text: 'Sedot sisa fluoridenya', time: 1.4 },
    ],
  },
};

/** Treatments that can be combined for patients with two problems (their mouth visuals don't clash). */
export const PAIRS = [
  ['scaling', 'filling'],
  ['scaling', 'extraction'],
  ['filling', 'extraction'],
  ['whitening', 'extraction'],
];

/** Fun facts shown after each patient (dental education, in Indonesian). */
export const FACTS = {
  scaling: ['Scaling sebaiknya dilakukan setiap 6 bulan untuk mencegah radang gusi.', 'Karang gigi tidak bisa hilang hanya dengan sikat gigi biasa.'],
  extraction: ['Setelah cabut gigi, gigit kasa 30 menit dan jangan berkumur dulu.', 'Gigi yang hilang sebaiknya diganti agar gigi lain tidak bergeser.'],
  filling: ['Lubang kecil yang cepat ditambal tidak perlu jadi perawatan akar.', 'Makanan manis dan lengket paling sering bikin gigi berlubang.'],
  whitening: ['Kopi, teh dan rokok adalah penyebab utama noda gigi.', 'Hasil pemutihan lebih awet kalau rajin sikat gigi 2x sehari.'],
  braces: ['Behel bekerja dengan tekanan lembut yang menggeser gigi pelan-pelan.', 'Pakai sikat khusus behel supaya sisa makanan tidak terselip.'],
  rootcanal: ['Perawatan saluran akar bisa menyelamatkan gigi agar tidak perlu dicabut.', 'Gigi nyut-nyutan biasanya tanda sarafnya sudah terinfeksi.'],
  checkup: ['Anak sebaiknya ke dokter gigi sejak gigi pertamanya tumbuh.', 'Fluoride membuat lapisan gigi lebih kuat melawan lubang.'],
};

/**
 * Personalities change how a patient behaves.
 *   hearts:   wrong tools allowed before they walk out
 *   patience: how long they wait (× normal)
 *   points:   score multiplier
 */
export const PERSONALITIES = {
  normal: { label: '', hearts: 3, patience: 1, points: 1 },
  scared: { label: 'Penakut', hearts: 2, patience: 1, points: 1.2, calm: 3 },
  chatty: { label: 'Cerewet', hearts: 3, patience: 1.4, points: 1 },
  vip: { label: 'VIP', hearts: 3, patience: 0.65, points: 2 },
  kid: { label: 'Anak', hearts: 3, patience: 0.9, points: 1.2, height: 0.72 },
};

export const LINES = {
  hello: ['Halo, Dokter!', 'Permisi, Dokter...', 'Selamat siang, Dokter!', 'Hai Dokter!'],
  sit: ['Aaa...', 'Aaaa~', 'Aaa (deg-degan)'],
  pain: ['ADUH!! Sakit, Dokter!', 'Aww! Pelan-pelan!', 'Hiii! Itu alat apa?!', 'Auuuw!'],
  mad: ['Bukan itu alatnya, Dokter!', 'Dokter yakin?!', 'Hmph! Salah lagi!', 'Dokter, fokus dong!'],
  lastChance: ['Sekali lagi salah, aku pulang ya!', 'Awas ya, Dokter... sekali lagi!'],
  leave: ['Aku pulang saja...', 'Huhu... cari dokter lain deh.', 'Gigiku masih sakit...'],
  thanks: ['Terima kasih, Dokter! Mantap!', 'Wah, enak sekali sekarang!', 'Dokter hebat!', 'Senyumku kembali!'],
  numb: ['Bibirku kebas... hehe', 'Mmm, mati rasa...'],
  stepOk: ['Bagus, Dokter!', 'Rapi sekali!', 'Lanjut, Dokter!', 'Mantap!'],
  scared: ['D-Dokter... aku takut...', 'Jangan sakit ya, Dokter...', 'Hiii... alatnya serem!'],
  calmed: ['Oke Dokter... aku siap.', 'Hehe, sudah tidak takut.', 'Makasih, Dokter...'],
  chat: ['Dokter, tahu tidak? Kucingku bisa salto.', 'Kemarin aku makan bakso 3 mangkok!', 'Dokter sudah nonton drama baru?', 'Aaa... ehh, eh, maaf Dokter...', 'Dokter, ini lama tidak?', 'Mmm-hmm... aa... (ngobrol terus)'],
  vipHello: ['Saya VIP, Dokter. Yang cepat ya!', 'Jadwal saya padat, Dokter!'],
  kidHello: ['Halo Dokter! Aku berani lho!', 'Dokter, nanti dapat stiker ya?'],
  kidThanks: ['Yeay! Dapat stiker!', 'Aku pemberani kan, Dokter?'],
  kidPain: ['Huwaaa! Mamaaa!', 'Hiks... sakit...'],
  waitBored: ['Lama sekali...', 'Aku pulang saja deh!', 'Hmph, lain kali saja.'],
  phone: ['Halo? Lagi di dokter gigi nih!', 'Iya Ma, nanti aku telepon balik!', 'Halo? Aaa-aaa... nanti ya!'],
  sneeze: ['Ha... ha...', 'HACHOOO!'],
  sleep: ['Zzz...', '(mendengkur)'],
  hik: ['Hik!', 'Hik! Maaf, Dokter... hik!'],
  rhythmOuch: ['Aw! Pelan, Dokter!', 'Ikuti iramanya, Dokter!'],
  mirror: ['Wah! Gigiku kinclong!', 'Wow... cantik sekali!', 'Hah! Ini gigiku?!', 'Senyumku keren!'],
  nurseGive: ['Ini, Dokter!', 'Pakai ini, Dokter!'],
};

/** Suster Nana names the tool (used by the tutorial and after mistakes). */
export const TOOL_HINT = {
  xray: 'lihat layar rontgen di sebelah kiri',
};

export const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Patients: names and looks (soft colours that fit the clinic). */
export const PATIENTS = [
  { name: 'Budi', look: { skin: '#e9b48f', hair: '#2f2420', hairStyle: 'short', top: '#7fb6e8', bottom: '#4f5d7a' } },
  { name: 'Sari', look: { skin: '#f3c9a6', hair: '#4a2f25', hairStyle: 'long', top: '#f6b9c9', bottom: '#8a6fa8' } },
  { name: 'Andi', look: { skin: '#c98f6a', hair: '#1f1a18', hairStyle: 'spiky', top: '#f7c95e', bottom: '#4d6b5e' } },
  { name: 'Dewi', look: { skin: '#f0c3a0', hair: '#6b4128', hairStyle: 'bob', top: '#b9a7e8', bottom: '#5d6b8c' } },
  { name: 'Joko', look: { skin: '#d9a07a', hair: '#9a9a9a', hairStyle: 'short', top: '#9ed9c2', bottom: '#6b5d4f' } },
  { name: 'Putri', look: { skin: '#f5d0b0', hair: '#2b1d17', hairStyle: 'pony', top: '#ffd1a8', bottom: '#5f7fae' } },
  { name: 'Bagas', look: { skin: '#b97f5c', hair: '#2a201c', hairStyle: 'curly', top: '#ef9a9a', bottom: '#3f4a5c' } },
  { name: 'Rina', look: { skin: '#f2c4a2', hair: '#7a3f2a', hairStyle: 'bun', top: '#a8e0d0', bottom: '#7a6f9a' } },
];

/** Kids (smaller, cry easily, love stickers). */
/** Kid patients (all girls: the kid voice is a girl's). */
export const KIDS = [
  { name: 'Dinda', look: { skin: '#e9b48f', hair: '#2f2420', hairStyle: 'bob', top: '#9ed9c2', bottom: '#5f7fae' } },
  { name: 'Nina', look: { skin: '#f3c9a6', hair: '#4a2f25', hairStyle: 'pony', top: '#ffd1a8', bottom: '#e98aa4' } },
  { name: 'Bella', look: { skin: '#c98f6a', hair: '#1f1a18', hairStyle: 'long', top: '#a8d8f0', bottom: '#e8a0c0' } },
  { name: 'Tiara', look: { skin: '#f0c3a0', hair: '#6b4128', hairStyle: 'bun', top: '#f6b9c9', bottom: '#b9a7e8' } },
];

/** The senior dentist who guides the player (welcome, steps, praise). White medical apron over teal scrubs. */
export const SENIOR = {
  name: 'Dokter Ratna',
  look: { skin: '#e8b996', hair: '#8f8a86', hairStyle: 'bun', top: '#4f9c86', bottom: '#4f9c86', shoes: '#ffffff', collar: '#ffffff', longSleeves: true, apron: '#ffffff', glasses: true, stethoscope: true },
};

export const ASSISTANT = {
  name: 'Suster Nana',
  look: { skin: '#f1c6a3', hair: '#3d2a22', hairStyle: 'bun', top: '#f6b9c9', bottom: '#f6b9c9', shoes: '#ffffff', cap: true, collar: '#ffffff', longSleeves: false },
};
