//! treadsim: the six Era DB2 tables behind zone music and ambience (spec §7).
//! Field indices are the WDC5 record fields of Era 1.15.9 (WoWDBDefs layouts AreaTable
//! 705C911D, ZoneMusic 72572D05, SoundAmbience 3FBF2710, SoundKit 2EB0F915 (inline IDs),
//! SoundKitEntry 8F82FF7D (SoundKitID in the relationship block), ZoneIntroMusicTable E1F93744).
use std::collections::HashMap;
use deku::prelude::*;
use wasm_bindgen::prelude::*;
use super::db::{DatabaseTable, Wdc4Db2File};

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct AreaTableRecord {
    // treadsim: read_string_direct, not read_string — field 1 (AreaName_lang) is storage
    // type None, so the string offset is field-relative, not record-relative.
    #[deku(reader = "db2.read_string_direct(deku::reader, 1, 0)")]
    pub name: String,
    #[deku(reader = "db2.read_field(deku::reader, 3)")]
    pub parent_area_id: u16,
    #[deku(reader = "db2.read_field(deku::reader, 7)")]
    pub ambience_id: u16,
    #[deku(reader = "db2.read_field(deku::reader, 9)")]
    pub zone_music: u16,
    #[deku(reader = "db2.read_field(deku::reader, 12)")]
    pub intro_sound: u16,
}

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct ZoneMusicRecord {
    #[deku(reader = "db2.read_vec(deku::reader, 1)")]
    pub silence_min_ms: Vec<u32>,
    #[deku(reader = "db2.read_vec(deku::reader, 2)")]
    pub silence_max_ms: Vec<u32>,
    #[deku(reader = "db2.read_vec(deku::reader, 3)")]
    pub sounds: Vec<u32>,
}

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct SoundAmbienceRecord {
    #[deku(reader = "db2.read_vec(deku::reader, 3)")]
    pub ambience_kits: Vec<u32>,
}

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct SoundKitRecord {
    #[deku(reader = "db2.read_field(deku::reader, 0)")]
    pub id: u32,           // inline ID
    #[deku(reader = "db2.read_field(deku::reader, 2)")]
    pub volume: f32,
}

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct SoundKitEntryRecord {
    #[deku(reader = "db2.read_field(deku::reader, 1)")]
    pub file_data_id: u32,
}

#[derive(DekuRead, Debug, Clone)]
#[deku(ctx = "db2: Wdc4Db2File")]
pub struct ZoneIntroMusicRecord {
    #[deku(reader = "db2.read_field(deku::reader, 1)")]
    pub sound_kit: u32,
    #[deku(reader = "db2.read_field(deku::reader, 3)")]
    pub min_delay_minutes: u16,
}

#[wasm_bindgen(js_name = "WowAreaAudio", getter_with_clone)]
#[derive(Debug, Clone)]
pub struct AreaAudio { pub name: String, pub parent_area_id: u32, pub ambience_id: u32, pub zone_music_id: u32, pub intro_sound_id: u32 }

#[wasm_bindgen(js_name = "WowZoneMusic", getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ZoneMusic { pub silence_min_ms: Vec<u32>, pub silence_max_ms: Vec<u32>, pub sound_kits: Vec<u32> }

#[wasm_bindgen(js_name = "WowZoneIntro")]
#[derive(Debug, Clone)]
pub struct ZoneIntro { pub sound_kit: u32, pub min_delay_minutes: u32 }

#[wasm_bindgen(js_name = "WowZoneAudioDb")]
pub struct ZoneAudioDb {
    areas: DatabaseTable<AreaTableRecord>,
    zone_music: DatabaseTable<ZoneMusicRecord>,
    ambiences: DatabaseTable<SoundAmbienceRecord>,
    kit_volumes: HashMap<u32, f32>,
    kit_files: HashMap<u32, Vec<u32>>,
    intros: DatabaseTable<ZoneIntroMusicRecord>,
}

#[wasm_bindgen(js_class = "WowZoneAudioDb")]
impl ZoneAudioDb {
    pub fn new(area_table: &[u8], zone_music: &[u8], sound_ambience: &[u8], sound_kit: &[u8], sound_kit_entry: &[u8], zone_intro_music: &[u8]) -> Result<ZoneAudioDb, String> {
        let areas = DatabaseTable::new(area_table)?;
        let zone_music = DatabaseTable::new(zone_music)?;
        let ambiences = DatabaseTable::new(sound_ambience)?;
        let kits: DatabaseTable<SoundKitRecord> = DatabaseTable::new(sound_kit)?;
        let entries: DatabaseTable<SoundKitEntryRecord> = DatabaseTable::new(sound_kit_entry)?;
        let intros = DatabaseTable::new(zone_intro_music)?;

        let kit_volumes = kits.records.iter().map(|k| (k.id, k.volume)).collect();
        let mut kit_files: HashMap<u32, Vec<u32>> = HashMap::new();
        // treadsim: deliberately hard-errors if SoundKitEntry ever ships empty (0 records) — an
        // empty table takes DatabaseTable's early-return path where foreign_keys is always None,
        // so this can't be told apart from "the relationship block is genuinely missing"; both are
        // fatal for zone audio (no kit -> file mapping at all), so failing loudly here is correct.
        let keys = entries.foreign_keys.as_ref().ok_or("SoundKitEntry has no relationship block")?;
        for (i, e) in entries.records.iter().enumerate() {
            kit_files.entry(keys[i]).or_default().push(e.file_data_id);
        }
        Ok(ZoneAudioDb { areas, zone_music, ambiences, kit_volumes, kit_files, intros })
    }

    pub fn area(&self, id: u32) -> Option<AreaAudio> {
        let r = self.areas.get_record(id)?;
        Some(AreaAudio { name: r.name.clone(), parent_area_id: r.parent_area_id as u32, ambience_id: r.ambience_id as u32, zone_music_id: r.zone_music as u32, intro_sound_id: r.intro_sound as u32 })
    }

    pub fn zone_music(&self, id: u32) -> Option<ZoneMusic> {
        let r = self.zone_music.get_record(id)?;
        Some(ZoneMusic { silence_min_ms: r.silence_min_ms.clone(), silence_max_ms: r.silence_max_ms.clone(), sound_kits: r.sounds.clone() })
    }

    pub fn ambience_kits(&self, id: u32) -> Option<Vec<u32>> {
        Some(self.ambiences.get_record(id)?.ambience_kits.clone())
    }

    pub fn sound_kit_files(&self, kit: u32) -> Vec<u32> {
        self.kit_files.get(&kit).cloned().unwrap_or_default()
    }

    pub fn sound_kit_volume(&self, kit: u32) -> f32 {
        *self.kit_volumes.get(&kit).unwrap_or(&1.0)
    }

    pub fn intro(&self, id: u32) -> Option<ZoneIntro> {
        let r = self.intros.get_record(id)?;
        Some(ZoneIntro { sound_kit: r.sound_kit, min_delay_minutes: r.min_delay_minutes as u32 })
    }
}

#[cfg(test)]
mod test {
    use super::*;

    /// Reads the data server's on-disk cache (`~/.cache/treadsim/cdn/files/<id>`), populated by
    /// any run of the renderer or by `curl localhost:8081/file/<id>`. Run with `cargo test -- --ignored`.
    fn cached(id: u32) -> Vec<u8> {
        let home = std::env::var("HOME").unwrap();
        std::fs::read(format!("{home}/.cache/treadsim/cdn/files/{id}")).unwrap_or_else(|e| panic!("cache miss for {}: {}", id, e))
    }

    #[test]
    #[ignore]
    fn elwynn_and_stormwind_chain() {
        let db = ZoneAudioDb::new(&cached(1353545), &cached(1310254), &cached(1310628), &cached(1237434), &cached(1237435), &cached(1310251)).unwrap();
        let elwynn = db.area(12).unwrap();
        assert_eq!(elwynn.name, "Elwynn Forest");
        assert_eq!((elwynn.parent_area_id, elwynn.ambience_id, elwynn.zone_music_id, elwynn.intro_sound_id), (0, 35, 1, 0));
        assert_eq!(db.area(87).unwrap().parent_area_id, 12);
        let sw = db.area(1519).unwrap();
        assert_eq!((sw.ambience_id, sw.zone_music_id, sw.intro_sound_id), (31, 13, 61));

        let zm = db.zone_music(1).unwrap();
        assert_eq!(zm.sound_kits, vec![2523, 2523]);
        assert_eq!(zm.silence_min_ms, vec![180000, 180000]);
        assert_eq!(zm.silence_max_ms, vec![300000, 300000]);
        assert_eq!(db.ambience_kits(35).unwrap(), vec![4183, 4184]);
        assert_eq!(db.sound_kit_files(2523), vec![53492, 53493, 53494]);
        assert_eq!(db.sound_kit_files(4183), vec![539131]);
        assert!((db.sound_kit_volume(2523) - 0.4).abs() < 0.01);
        assert!((db.sound_kit_volume(4183) - 0.69).abs() < 0.01);
        let intro = db.intro(61).unwrap();
        assert_eq!((intro.sound_kit, intro.min_delay_minutes), (2541, 60));
        assert!(db.area(999999).is_none());
        assert!(db.sound_kit_files(1).is_empty());
    }
}


