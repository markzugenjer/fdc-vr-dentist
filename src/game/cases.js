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
    complaints: ['Gigiku kuning dan ada karangnya, Dok!', 'Kata temanku napasku bau... tolong, Dok!', 'Gusiku suka berdarah kalau sikat gigi.'],
    steps: [
      { tool: 'mirror', text: 'Periksa gigi pasien', time: 1.2 },
      { tool: 'scaler', text: 'Bersihkan karang gigi', time: 3.2 },
      { tool: 'suction', text: 'Sedot air dan sisa karang', time: 1.6 },
    ],
  },
  extraction: {
    title: 'Cabut gigi',
    complaints: ['Gigiku goyang dan sakit sekali...', 'Gigi bawahku goyang, Dok. Takut!', 'Ada gigi yang sudah rusak, Dok.'],
    steps: [
      { tool: 'syringe', text: 'Bius dulu supaya tidak sakit', time: 1.4 },
      { tool: 'forceps', text: 'Cabut gigi yang goyang', time: 2.4 },
      { tool: 'gauze', text: 'Tahan darah di bekas cabutan', time: 1.3 },
    ],
  },
  filling: {
    title: 'Tambal gigi',
    complaints: ['Ada lubang di gigiku, ngilu kalau minum es!', 'Gigi atasku berlubang, Dok.', 'Kalau makan manis, gigiku cenat-cenut!'],
    steps: [
      { tool: 'mirror', text: 'Cari gigi yang berlubang', time: 1.2 },
      { tool: 'drill', text: 'Bersihkan lubang gigi', time: 2.6 },
      { tool: 'filling', text: 'Isi lubang dengan tambalan', time: 1.8 },
      { tool: 'light', text: 'Keraskan tambalan', time: 1.6 },
    ],
  },
};

export const LINES = {
  hello: ['Halo, Dok!', 'Permisi, Dok...', 'Selamat siang, Dok!', 'Hai Dokter!'],
  sit: ['Aaa...', 'Aaaa~', 'Aaa (deg-degan)'],
  pain: ['ADUH!! Sakit, Dok!', 'Aww! Pelan-pelan!', 'Hiii! Itu alat apa?!', 'Auuuw!'],
  mad: ['Bukan itu alatnya, Dok!', 'Dokter yakin?!', 'Hmph! Salah lagi!', 'Dok, fokus dong!'],
  lastChance: ['Sekali lagi salah, aku pulang ya!', 'Awas ya, Dok... sekali lagi!'],
  leave: ['Aku pulang saja...', 'Huhu... cari dokter lain deh.', 'Gigiku masih sakit...'],
  thanks: ['Terima kasih, Dok! Mantap!', 'Wah, enak sekali sekarang!', 'Dokter hebat!', 'Senyumku kembali!'],
  numb: ['Bibirku kebas... hehe', 'Mmm, mati rasa...'],
  stepOk: ['Bagus, Dok!', 'Rapi sekali!', 'Lanjut, Dok!', 'Mantap!'],
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

export const ASSISTANT = {
  name: 'Suster Nana',
  look: { skin: '#f1c6a3', hair: '#3d2a22', hairStyle: 'bun', top: '#f6b9c9', bottom: '#f6b9c9', shoes: '#ffffff', cap: true, collar: '#ffffff', longSleeves: false },
};
