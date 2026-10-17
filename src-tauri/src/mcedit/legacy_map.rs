use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockStatePos};
use crate::utils::schematic_data::{SchematicData, SchematicError};
use crate::utils::tile_entities::{TileEntities, TileEntitiesList};
use serde::Deserialize;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, OnceLock};

/// Namespace used for unmapped legacy numeric block ids.
pub const LEGACY_NAMESPACE: &str = "legacy";

/// Legacy `.schematic` targets supported by the compatibility layer.
///
/// The file format itself predates flattened block states.  Keeping the
/// version list separate from the modern Java registry prevents a 1.7.10
/// numeric palette from being mistaken for a Java DataVersion registry.
const LEGACY_VERSIONS: &[&str] = &["1.7.10", "1.8.9", "1.9.4", "1.10.2", "1.11.2", "1.12.2"];

pub const MAX_LEGACY_DIMENSION: i32 = i16::MAX as i32;
pub const MAX_LEGACY_VOLUME: i64 = 64 * 1024 * 1024;
pub const MAX_LEGACY_ID: u32 = 0x0FFF;

/// Authoritative pre-flattening id/data table from EngineHub/WorldEdit:
/// https://github.com/EngineHub/WorldEdit/blob/master/worldedit-core/src/main/resources/com/sk89q/worldedit/world/registry/legacy.json
const LEGACY_DATA: &str = include_str!("../../data/legacy_blocks.json");

static CODEC: OnceLock<LegacyBlockCodec> = OnceLock::new();

#[derive(Debug, Deserialize)]
struct LegacyDataFile {
    blocks: HashMap<String, String>,
    #[allow(dead_code)]
    items: HashMap<String, String>,
}

/// Codec for the pre-flattening (1.12 and earlier) numeric block palette.
///
/// The implementation mirrors WorldEdit's `LegacyMapper`:
/// * `id:data -> blockstate` for decoding;
/// * `blockstate -> first id:data` for encoding;
/// * blockstates with extra properties fall back to the base state.
#[derive(Debug, Clone)]
pub struct LegacyBlockCodec {
    forward: HashMap<(u32, u8), (Arc<str>, BTreeMap<Arc<str>, Arc<str>>)>,
    reverse: HashMap<(Arc<str>, BTreeMap<Arc<str>, Arc<str>>), (u32, u8)>,
    base: HashMap<Arc<str>, (u32, u8)>,
    defaults: HashMap<Arc<str>, (u32, u8)>,
    states: HashMap<Arc<str>, Vec<(u32, u8, BTreeMap<Arc<str>, Arc<str>>)>>,
}

impl LegacyBlockCodec {
    pub fn new() -> Self {
        let data: LegacyDataFile =
            serde_json::from_str(LEGACY_DATA).expect("failed to parse bundled legacy_blocks.json");

        let mut forward = HashMap::new();
        let mut reverse = HashMap::new();
        let mut base = HashMap::new();
        let mut defaults = HashMap::new();
        let mut states: HashMap<Arc<str>, Vec<(u32, u8, BTreeMap<Arc<str>, Arc<str>>)>> =
            HashMap::new();

        for (key, value) in data.blocks {
            let Some((id, data)) = parse_legacy_key(&key) else {
                continue;
            };
            let (name, properties) = parse_state(&value);
            let name = Arc::<str>::from(name.as_str());

            if properties.is_empty() {
                insert_prefer_lowest(&mut base, name.clone(), (id, data));
            }
            insert_prefer_lowest(&mut defaults, name.clone(), (id, data));
            states
                .entry(name.clone())
                .or_default()
                .push((id, data, properties.clone()));

            let block_key = (name.clone(), properties.clone());
            forward.entry((id, data)).or_insert((name, properties));
            insert_prefer_lowest(&mut reverse, block_key, (id, data));
        }

        Self {
            forward,
            reverse,
            base,
            defaults,
            states,
        }
    }

    pub fn decode(&self, legacy_id: u32, data: u8) -> Arc<BlockData> {
        if let Some((name, properties)) = self.forward.get(&(legacy_id, data)) {
            return block_from_map(name.as_ref(), properties.clone());
        }

        let mut properties = BTreeMap::new();
        properties.insert(Arc::<str>::from("data"), Arc::<str>::from(data.to_string()));
        block_from_map(&format!("{LEGACY_NAMESPACE}:{legacy_id}"), properties)
    }

    pub fn encode(&self, block: &BlockData) -> Option<(u32, u8)> {
        let name = block.id.name.as_ref();

        if let Some(rest) = name.strip_prefix(LEGACY_NAMESPACE) {
            let rest = rest.strip_prefix(':')?;
            let id: u32 = rest.parse().ok()?;
            let data = block
                .properties
                .get("data")
                .and_then(|value| value.parse::<u8>().ok())
                .unwrap_or(0);
            return Some((id, data));
        }

        let key = (block.id.name.clone(), block.properties.clone());
        if let Some(&(id, data)) = self.reverse.get(&key) {
            return Some((id, data));
        }

        if let Some(&(id, data)) = self.base.get(&block.id.name) {
            eprintln!("[legacy-map] dropping properties for {name} -> {id}:{data}");
            return Some((id, data));
        }

        None
    }

    /// Return a deterministic state for a block name when no exact property
    /// combination exists.  This is used by the compatibility layer for
    /// modern states whose properties did not exist before flattening.
    pub fn default_state(&self, name: &str) -> Option<(Arc<BlockData>, (u32, u8))> {
        let &(id, data) = self.defaults.get(name)?;
        let (_, properties) = self.forward.get(&(id, data))?;
        Some((block_from_map(name, properties.clone()), (id, data)))
    }

    pub fn states_for_name(
        &self,
        name: &str,
    ) -> Option<&[(u32, u8, BTreeMap<Arc<str>, Arc<str>>)]> {
        self.states.get(name).map(Vec::as_slice)
    }
}

fn insert_prefer_lowest<K: Eq + std::hash::Hash>(
    map: &mut HashMap<K, (u32, u8)>,
    key: K,
    value: (u32, u8),
) {
    match map.get_mut(&key) {
        Some(existing) if *existing <= value => {}
        Some(existing) => *existing = value,
        None => {
            map.insert(key, value);
        }
    }
}

fn parse_legacy_key(key: &str) -> Option<(u32, u8)> {
    let (id, data) = key.split_once(':')?;
    Some((id.parse().ok()?, data.parse().ok()?))
}

fn parse_state(value: &str) -> (String, BTreeMap<Arc<str>, Arc<str>>) {
    let (head, props) = value
        .split_once('[')
        .map(|(head, props)| (head, props.strip_suffix(']').unwrap_or(props)))
        .unwrap_or((value, ""));

    let mut properties = BTreeMap::new();
    for prop in props.split(',').filter(|part| !part.is_empty()) {
        let Some((key, value)) = prop.split_once('=') else {
            continue;
        };
        properties.insert(Arc::<str>::from(key), Arc::<str>::from(value));
    }

    (head.to_string(), properties)
}

fn block_from_map(name: &str, properties: BTreeMap<Arc<str>, Arc<str>>) -> Arc<BlockData> {
    Arc::new(BlockData {
        id: BlockId {
            name: Arc::<str>::from(name),
        },
        properties,
    })
}

pub fn codec() -> &'static LegacyBlockCodec {
    CODEC.get_or_init(LegacyBlockCodec::new)
}

pub fn versions() -> Vec<&'static str> {
    LEGACY_VERSIONS.to_vec()
}

pub fn is_supported_version(version: &str) -> bool {
    LEGACY_VERSIONS.contains(&version)
}

/// Normalize a modern Java block state to a state representable by the
/// requested legacy numeric palette.
///
/// The MCEdit format can technically store ids through 4095, but a vanilla
/// 1.7.10 client only understands the pre-1.8 block table.  We therefore
/// reject post-1.7 ids even when the bundled 1.12 legacy table happens to
/// contain them, and apply explicit aliases before using a stone fallback.
pub fn normalize_block_for_legacy(
    target_version: &str,
    block: &BlockData,
) -> Result<Arc<BlockData>, SchematicError> {
    if !is_supported_version(target_version) {
        return Err(SchematicError::MissingField(format!(
            "unknown legacy target version: {target_version}"
        )));
    }

    let source_name = bare_name(block.id.name.as_ref());

    // Prefer an exact state from the target palette before applying the
    // broad compatibility aliases below. This preserves 1.8+ blocks such as
    // slime, prismarine and shulker boxes when the selected target actually
    // contains them, while still rejecting them for older targets.
    if let Some(candidate) = find_encodable_candidate(target_version, block) {
        return Ok(candidate);
    }

    let (mapped_name, mapped_properties) =
        map_modern_name(target_version, source_name, &block.properties);
    let mapped = BlockData {
        id: BlockId {
            name: Arc::<str>::from(format!("minecraft:{mapped_name}")),
        },
        properties: mapped_properties,
    };

    if let Some(candidate) = find_encodable_candidate(target_version, &mapped) {
        return Ok(candidate);
    }

    // A mapped name can still have a state shape that did not exist in the
    // source version (for example fire's directional properties).  Use the
    // first deterministic legacy state for that name before the global stone
    // fallback, preserving as much semantic identity as possible.
    let mapped_qualified_name = format!("minecraft:{mapped_name}");
    if let Some((candidate, (id, _))) = codec().default_state(&mapped_qualified_name) {
        if target_state_allowed(target_version, id, &mapped_name) {
            eprintln!(
                "[legacy-map] dropping unsupported properties for {} -> {}",
                source_name, mapped_name
            );
            return Ok(candidate);
        }
    }

    let fallback = BlockData {
        id: BlockId {
            name: Arc::<str>::from("minecraft:stone"),
        },
        properties: BTreeMap::new(),
    };
    eprintln!(
        "[legacy-map] {} is unavailable in legacy {}; using minecraft:stone",
        source_name, target_version
    );
    Ok(Arc::new(fallback))
}

pub fn normalize_schematic_for_legacy(
    target_version: &str,
    data: &SchematicData,
) -> Result<SchematicData, SchematicError> {
    if !is_supported_version(target_version) {
        return Err(SchematicError::MissingField(format!(
            "unknown legacy target version: {target_version}"
        )));
    }

    let mut normalized_cache: HashMap<BlockData, Arc<BlockData>> = HashMap::new();
    let blocks = data
        .blocks
        .elements
        .iter()
        .map(|block| {
            let source = block.block.as_ref();
            let normalized = if let Some(cached) = normalized_cache.get(source) {
                cached.clone()
            } else {
                let normalized = normalize_block_for_legacy(target_version, source)?;
                normalized_cache.insert(source.clone(), normalized.clone());
                normalized
            };
            Ok(BlockStatePos {
                pos: block.pos,
                block: normalized,
            })
        })
        .collect::<Result<_, SchematicError>>()?;

    let tile_entities = normalize_tile_entities(&data.tile_entities_list);

    Ok(SchematicData::new(
        crate::utils::block_state_pos_list::BlockStatePosList { elements: blocks },
        tile_entities,
        data.entities_list.clone(),
        data.size,
    ))
}

fn normalize_tile_entities(source: &TileEntitiesList) -> TileEntitiesList {
    TileEntitiesList {
        original_type: source.original_type,
        elements: source
            .elements
            .iter()
            .filter_map(|entity| {
                let nbt = normalize_tile_entity_nbt(&entity.nbt)?;
                Some(TileEntities {
                    pos: entity.pos,
                    nbt,
                })
            })
            .collect(),
    }
}

/// Normalize a block entity for the legacy tile-entity palette.
///
/// Modern-only entities (for example banners, bells and shulker boxes) are
/// omitted because writing their names into a 1.7.10 schematic produces an
/// entity that the target client cannot load. This is intentionally a lossy
/// fallback, matching the block-level downgrade policy.
fn normalize_tile_entity_nbt(nbt: &fastnbt::Value) -> Option<fastnbt::Value> {
    let fastnbt::Value::Compound(map) = nbt else {
        return Some(nbt.clone());
    };

    let mut normalized = map.clone();
    if let Some(fastnbt::Value::String(id)) = map.get("id") {
        if let Some(legacy_id) = legacy_tile_entity_id(id) {
            normalized.insert(
                "id".to_string(),
                fastnbt::Value::String(legacy_id.to_string()),
            );
        } else if !is_legacy_tile_entity_id(id) {
            eprintln!("[legacy-map] dropping unsupported tile entity {id}");
            return None;
        }
    }

    if normalized.get("id").and_then(fastnbt::Value::as_str) == Some("Sign") {
        normalize_sign_nbt(&mut normalized);
    }
    Some(fastnbt::Value::Compound(normalized))
}

fn normalize_sign_nbt(map: &mut HashMap<String, fastnbt::Value>) {
    let messages = map
        .get("front_text")
        .and_then(|value| match value {
            fastnbt::Value::Compound(front_text) => front_text.get("messages"),
            _ => None,
        })
        .and_then(|value| match value {
            fastnbt::Value::List(messages) => Some(messages),
            _ => None,
        });
    let messages = messages
        .map(|messages| {
            messages
                .iter()
                .filter_map(|value| match value {
                    fastnbt::Value::String(text) => Some(text.clone()),
                    _ => None,
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    for index in 0..4 {
        let key = format!("Text{}", index + 1);
        if map.contains_key(&key) {
            continue;
        }

        let value = messages
            .get(index)
            .cloned()
            .unwrap_or_else(|| "{\"text\":\"\"}".to_string());
        map.insert(key, fastnbt::Value::String(value));
    }

    // These fields were introduced with the split front/back sign format and
    // are ignored by 1.7.10. Keeping them can make old tile-entity readers
    // reject an otherwise valid Sign tag.
    map.remove("front_text");
    map.remove("back_text");
    map.remove("is_waxed");
    map.remove("GlowingText");
}

fn is_legacy_tile_entity_id(id: &str) -> bool {
    matches!(
        id,
        "Chest"
            | "Trap"
            | "EnderChest"
            | "Furnace"
            | "Hopper"
            | "Dropper"
            | "MobSpawner"
            | "Beacon"
            | "Skull"
            | "RecordPlayer"
            | "Music"
            | "FlowerPot"
            | "Cauldron"
            | "EnchantTable"
            | "Control"
            | "Comparator"
            | "DLDetector"
            | "Piston"
            | "Sign"
    )
}

fn legacy_tile_entity_id(id: &str) -> Option<&'static str> {
    let name = id.strip_prefix("minecraft:").unwrap_or(id);
    if name.ends_with("_sign")
        || name.ends_with("_wall_sign")
        || name.ends_with("_hanging_sign")
        || name.ends_with("_wall_hanging_sign")
    {
        return Some("Sign");
    }

    match name {
        "chest" => Some("Chest"),
        "trapped_chest" => Some("Chest"),
        "ender_chest" => Some("EnderChest"),
        "furnace" | "smoker" | "blast_furnace" => Some("Furnace"),
        "hopper" => Some("Hopper"),
        "dispenser" => Some("Trap"),
        "dropper" => Some("Dropper"),
        "sign" => Some("Sign"),
        "mob_spawner" | "spawner" => Some("MobSpawner"),
        "beacon" => Some("Beacon"),
        "skull"
        | "player_head"
        | "skeleton_skull"
        | "wither_skeleton_skull"
        | "zombie_head"
        | "creeper_head" => Some("Skull"),
        "jukebox" => Some("RecordPlayer"),
        "note_block" => Some("Music"),
        "flower_pot" => Some("FlowerPot"),
        "brewing_stand" | "cauldron" => Some("Cauldron"),
        "enchanting_table" => Some("EnchantTable"),
        "command_block" | "chain_command_block" | "repeating_command_block" => Some("Control"),
        "comparator" => Some("Comparator"),
        "daylight_detector" => Some("DLDetector"),
        "piston" | "sticky_piston" => Some("Piston"),
        "barrel" => Some("Chest"),
        _ => None,
    }
}

#[tauri::command]
pub fn get_legacy_block_versions() -> Vec<&'static str> {
    versions()
}

fn bare_name(name: &str) -> &str {
    name.strip_prefix("minecraft:").unwrap_or(name)
}

fn target_state_allowed(target_version: &str, id: u32, name: &str) -> bool {
    let max_id = match target_version {
        // 1.7.10 has no blocks 165-169; those ids were introduced in 1.8.
        "1.7.10" => 175,
        // 1.8 added banners, stained glass panes and the six wood families.
        "1.8.9" => 197,
        // 1.9 added the chorus/purpur/end blocks and related command blocks.
        "1.9.4" => 212,
        // 1.10 added the Nether update blocks through structure void.
        "1.10.2" => 217,
        // 1.11 added observers and shulker boxes.
        "1.11.2" => 234,
        // 1.12 is the last pre-flattening palette and includes concrete/glazed
        // terracotta through the structure block.
        "1.12.2" => 255,
        _ => return false,
    };

    if id > max_id {
        return false;
    }

    // Some bundled legacy entries are aliases for blocks introduced after the
    // numeric id range above. Keep the name guard explicit for 1.7 because
    // those ids overlap the later palette in the shared table.
    if target_version == "1.7.10"
        && matches!(
            name,
            "granite"
                | "polished_granite"
                | "diorite"
                | "polished_diorite"
                | "andesite"
                | "polished_andesite"
                | "smooth_stone"
                | "slime_block"
                | "barrier"
                | "iron_trapdoor"
                | "prismarine"
                | "prismarine_bricks"
                | "dark_prismarine"
                | "sea_lantern"
        )
    {
        return false;
    }

    true
}

fn find_encodable_candidate(target_version: &str, block: &BlockData) -> Option<Arc<BlockData>> {
    let states = codec().states_for_name(block.id.name.as_ref())?;
    let mut best: Option<(usize, usize, usize, (u32, u8), Arc<BlockData>)> = None;

    for &(id, data, ref state_properties) in states {
        if !target_state_allowed(target_version, id, bare_name(block.id.name.as_ref())) {
            continue;
        }

        // Prefer states that preserve the largest number of property values.
        // A property that differs is counted separately from a property that
        // is simply absent in the modern state; this lets, for example, a
        // 1.20 stair with `shape=outer_left` retain its facing/half while
        // dropping the shape that 1.7.10 cannot represent.
        let matched = state_properties
            .iter()
            .filter(|(name, value)| {
                block.properties.get(name.as_ref()).map(AsRef::as_ref) == Some(value.as_ref())
            })
            .count();
        let mismatched = state_properties
            .iter()
            .filter(|(name, value)| {
                block
                    .properties
                    .get(name.as_ref())
                    .is_some_and(|actual| actual.as_ref() != value.as_ref())
            })
            .count();
        let total = state_properties.len();
        let candidate = Arc::new(BlockData {
            id: block.id.clone(),
            properties: state_properties.clone(),
        });
        let key = (id, data);
        if best
            .as_ref()
            .is_none_or(|(best_matched, best_mismatched, best_total, best_key, _)| {
                matched > *best_matched
                    || (matched == *best_matched && mismatched < *best_mismatched)
                    || (matched == *best_matched
                        && mismatched == *best_mismatched
                        && total < *best_total)
                    || (matched == *best_matched
                        && mismatched == *best_mismatched
                        && total == *best_total
                        && key < *best_key)
            })
        {
            best = Some((matched, mismatched, total, key, candidate));
        }
    }

    best.map(|(_, _, _, _, candidate)| candidate)
}

fn map_modern_name(
    target_version: &str,
    name: &str,
    properties: &BTreeMap<Arc<str>, Arc<str>>,
) -> (String, BTreeMap<Arc<str>, Arc<str>>) {
    let mut mapped = match name {
        "air" | "cave_air" | "void_air" => "air".to_string(),
        "flowing_water" => "water".to_string(),
        "flowing_lava" => "lava".to_string(),
        "dirt_path" | "grass_path" => "dirt".to_string(),
        "granite"
        | "polished_granite"
        | "diorite"
        | "polished_diorite"
        | "andesite"
        | "polished_andesite"
        | "deepslate"
        | "polished_deepslate"
        | "deepslate_bricks"
        | "deepslate_tiles"
        | "cobbled_deepslate"
        | "tuff"
        | "sculk"
        | "sculk_catalyst"
        | "sculk_sensor"
        | "calibrated_sculk_sensor"
        | "smooth_stone" => "stone".to_string(),
        "red_sandstone" | "chiseled_red_sandstone" | "cut_red_sandstone" => "sandstone".to_string(),
        "red_sandstone_stairs" => "sandstone_stairs".to_string(),
        "red_sandstone_slab" => "sandstone_slab".to_string(),
        "slime_block" | "barrier" | "iron_trapdoor" => {
            if name == "iron_trapdoor" {
                "oak_trapdoor".to_string()
            } else {
                "stone".to_string()
            }
        }
        "prismarine" | "prismarine_bricks" | "dark_prismarine" => "stone".to_string(),
        "sea_lantern" | "lantern" | "soul_lantern" | "end_rod" => "torch".to_string(),
        "mossy_cobblestone_wall" => "cobblestone_wall".to_string(),
        "chiseled_bookshelf" => "bookshelf".to_string(),
        "copper_bulb" => "redstone_lamp".to_string(),
        "red_nether_bricks" | "nether_wart_block" => "nether_bricks".to_string(),
        "bone_block" | "magma_block" | "ancient_debris" | "netherite_block" => "stone".to_string(),
        "mud" | "packed_mud" | "mud_bricks" => "dirt".to_string(),
        "bamboo" | "bamboo_sapling" => "sugar_cane".to_string(),
        "bamboo_block" | "stripped_bamboo_block" => "oak_log".to_string(),
        "mangrove_roots" | "muddy_mangrove_roots" => "dirt".to_string(),
        "mangrove_propagule" => "oak_sapling".to_string(),
        "campfire" | "soul_campfire" => "fire".to_string(),
        "powder_snow" | "frosted_ice" => "snow".to_string(),
        "water_cauldron" | "lava_cauldron" | "powder_snow_cauldron" => "cauldron".to_string(),
        "bubble_column" => "water".to_string(),
        "structure_void" | "light" => "air".to_string(),
        "observer" | "scaffolding" | "honey_block" | "honeycomb_block" => "stone".to_string(),
        "barrel" => "chest".to_string(),
        "smoker" | "blast_furnace" => "furnace".to_string(),
        "grindstone" => "anvil".to_string(),
        "bell" => "anvil".to_string(),
        "lectern" => "bookshelf".to_string(),
        "stonecutter" | "cartography_table" | "fletching_table" | "smithing_table" | "loom" => {
            "crafting_table".to_string()
        }
        "composter" => "cauldron".to_string(),
        "beehive" | "bee_nest" => "chest".to_string(),
        "chorus_plant" | "chorus_flower" | "end_stone_bricks" | "end_gateway" => {
            "end_stone".to_string()
        }
        "purpur_block" | "purpur_pillar" | "purpur_stairs" | "purpur_slab" => {
            "quartz_block".to_string()
        }
        "copper_ore" | "deepslate_copper_ore" => "iron_ore".to_string(),
        "deepslate_iron_ore" => "iron_ore".to_string(),
        "deepslate_gold_ore" => "gold_ore".to_string(),
        "deepslate_coal_ore" => "coal_ore".to_string(),
        "deepslate_diamond_ore" => "diamond_ore".to_string(),
        "deepslate_emerald_ore" => "emerald_ore".to_string(),
        "deepslate_lapis_ore" => "lapis_ore".to_string(),
        "deepslate_redstone_ore" => "redstone_ore".to_string(),
        "raw_copper_block"
        | "copper_block"
        | "exposed_copper"
        | "weathered_copper"
        | "oxidized_copper"
        | "cut_copper"
        | "exposed_cut_copper"
        | "weathered_cut_copper"
        | "oxidized_cut_copper"
        | "waxed_copper_block"
        | "waxed_exposed_copper"
        | "waxed_weathered_copper"
        | "waxed_oxidized_copper"
        | "waxed_cut_copper"
        | "waxed_exposed_cut_copper"
        | "waxed_weathered_cut_copper"
        | "waxed_oxidized_cut_copper" => "iron_block".to_string(),
        "raw_iron_block" => "iron_block".to_string(),
        "raw_gold_block" => "gold_block".to_string(),
        "amethyst_block"
        | "budding_amethyst"
        | "small_amethyst_bud"
        | "medium_amethyst_bud"
        | "large_amethyst_bud"
        | "amethyst_cluster"
        | "tinted_glass" => "glass".to_string(),
        "nether_gold_ore" => "gold_ore".to_string(),
        "soul_torch" => "torch".to_string(),
        "decorated_pot" => "flower_pot".to_string(),
        "suspicious_sand" => "sand".to_string(),
        "suspicious_gravel" => "gravel".to_string(),
        "trial_spawner" => "spawner".to_string(),
        "vault" => "chest".to_string(),
        "crafter" => "crafting_table".to_string(),
        "reinforced_deepslate" | "heavy_core" => "stone".to_string(),
        "respawn_anchor" | "crying_obsidian" => "obsidian".to_string(),
        "blackstone" | "polished_blackstone" | "polished_blackstone_bricks" => "stone".to_string(),
        "polished_basalt" | "calcite" | "lodestone" | "target" => "stone".to_string(),
        "quartz_bricks" | "smooth_quartz" => "quartz_block".to_string(),
        "soul_soil" => "soul_sand".to_string(),
        "weeping_vines" | "twisting_vines" | "glow_lichen" => "vine".to_string(),
        "cave_vines" | "cave_vines_plant" => "vine".to_string(),
        "crimson_nylium" | "warped_nylium" => "netherrack".to_string(),
        "crimson_stem" | "warped_stem" | "crimson_hyphae" | "warped_hyphae" => {
            "nether_bricks".to_string()
        }
        "frogspawn" => "water".to_string(),
        "sniffer_egg" => "stone".to_string(),
        "spore_blossom" | "pink_petals" | "torchflower" | "pitcher_plant" => "grass".to_string(),
        "torchflower_crop" => "wheat".to_string(),
        "candle" | "white_candle" | "orange_candle" | "magenta_candle" | "light_blue_candle"
        | "yellow_candle" | "lime_candle" | "pink_candle" | "gray_candle" | "light_gray_candle"
        | "cyan_candle" | "purple_candle" | "blue_candle" | "brown_candle" | "green_candle"
        | "red_candle" | "black_candle" => "torch".to_string(),
        _ => name.to_string(),
    };

    let mut mapped_properties = properties.clone();
    mapped_properties.remove("waterlogged");

    if mapped == name {
        let qualified_name = format!("minecraft:{name}");
        let direct_state_is_usable = codec()
            .default_state(&qualified_name)
            .map(|(_, (id, _))| target_state_allowed(target_version, id, name))
            .unwrap_or(false);
        if direct_state_is_usable {
            return (mapped, mapped_properties);
        }

        if name.starts_with("potted_") {
            mapped = "flower_pot".to_string();
        } else if name.ends_with("_wall_hanging_sign") {
            mapped = "wall_sign".to_string();
        } else if name.ends_with("_hanging_sign") {
            mapped = "sign".to_string();
        } else if let Some(stripped) = name.strip_prefix("waxed_") {
            mapped = stripped.to_string();
            if matches!(
                mapped.as_str(),
                "copper_block"
                    | "exposed_copper"
                    | "weathered_copper"
                    | "oxidized_copper"
                    | "cut_copper"
                    | "exposed_cut_copper"
                    | "weathered_cut_copper"
                    | "oxidized_cut_copper"
            ) {
                mapped = "iron_block".to_string();
            }
        } else if let Some(color) = name.strip_suffix("_concrete") {
            mapped = format!("{color}_wool");
        } else if let Some(color) = name.strip_suffix("_concrete_powder") {
            mapped = format!("{color}_wool");
        } else if let Some(color) = name.strip_suffix("_glazed_terracotta") {
            mapped = format!("{color}_terracotta");
        } else if name.ends_with("_shulker_box") {
            mapped = format!("{}_wool", name.trim_end_matches("_shulker_box"));
        } else if name.ends_with("_banner") || name.ends_with("_wall_banner") {
            mapped = "white_wool".to_string();
        } else if name.ends_with("_bed") && name != "red_bed" {
            mapped = "red_bed".to_string();
        } else if name.starts_with("stripped_") {
            let wood = name.trim_start_matches("stripped_");
            // Stripped wood was added after flattening. Preserve the legacy
            // wood family where it exists and use oak for newer families.
            mapped = match wood {
                "oak_log" | "oak_wood" => wood.to_string(),
                "spruce_log" | "spruce_wood" => wood.to_string(),
                "birch_log" | "birch_wood" => wood.to_string(),
                "jungle_log" | "jungle_wood" => wood.to_string(),
                "acacia_log" | "acacia_wood" => wood.to_string(),
                "dark_oak_log" | "dark_oak_wood" => wood.to_string(),
                _ if wood.ends_with("_log") || wood.ends_with("_wood") => "oak_log".to_string(),
                _ => "oak_log".to_string(),
            };
        } else if name.ends_with("_ore") && !name.contains("iron") && !name.contains("gold") {
            mapped = "coal_ore".to_string();
        } else if name.ends_with("_log") || name.ends_with("_wood") {
            mapped = "oak_log".to_string();
        } else if name.ends_with("_leaves") {
            mapped = "oak_leaves".to_string();
        } else if name.ends_with("_sapling") {
            mapped = "oak_sapling".to_string();
        } else if name.ends_with("_planks") {
            mapped = "oak_planks".to_string();
        } else if name.ends_with("_stairs") {
            mapped = "cobblestone_stairs".to_string();
        } else if name.ends_with("_slab") {
            mapped = "stone_slab".to_string();
        } else if name.ends_with("_fence_gate") {
            mapped = "oak_fence_gate".to_string();
        } else if name.ends_with("_fence") {
            mapped = "oak_fence".to_string();
        } else if name.ends_with("_door") {
            mapped = "oak_door".to_string();
        } else if name.ends_with("_trapdoor") {
            mapped = "oak_trapdoor".to_string();
        } else if name.ends_with("_button") {
            mapped = "stone_button".to_string();
        } else if name.ends_with("_pressure_plate") {
            mapped = "stone_pressure_plate".to_string();
        } else if name.ends_with("_wall_sign") {
            mapped = "wall_sign".to_string();
        } else if name.ends_with("_wall") {
            mapped = "cobblestone_wall".to_string();
        } else if name.ends_with("_sign") {
            mapped = if name.starts_with("wall_") {
                "wall_sign".to_string()
            } else {
                "sign".to_string()
            };
        } else if name == "short_grass" {
            mapped = "grass".to_string();
        } else if name == "seagrass" || name == "kelp" || name == "kelp_plant" {
            mapped = "sugar_cane".to_string();
        } else if name == "sweet_berry_bush" || name == "big_dripleaf" || name == "small_dripleaf" {
            mapped = "grass".to_string();
        } else if name.ends_with("_torch") {
            mapped = if name.starts_with("redstone_") {
                "redstone_torch".to_string()
            } else {
                "torch".to_string()
            };
        }
    }

    (mapped, mapped_properties)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::block_state_pos_list::BlockPos;

    fn block(name: &str, properties: &[(&str, &str)]) -> BlockData {
        BlockData {
            id: BlockId {
                name: Arc::<str>::from(name),
            },
            properties: properties
                .iter()
                .map(|(key, value)| (Arc::<str>::from(*key), Arc::<str>::from(*value)))
                .collect(),
        }
    }

    #[test]
    fn exposes_legacy_target_versions() {
        assert_eq!(
            versions(),
            vec!["1.7.10", "1.8.9", "1.9.4", "1.10.2", "1.11.2", "1.12.2"]
        );
        assert!(is_supported_version("1.7.10"));
        assert!(is_supported_version("1.12.2"));
        assert!(!is_supported_version("1.13.2"));
    }

    #[test]
    fn maps_common_modern_states_to_legacy_states() {
        let oak_log =
            normalize_block_for_legacy("1.7.10", &block("minecraft:oak_log", &[("axis", "y")]))
                .unwrap();
        assert_eq!(oak_log.id.name.as_ref(), "minecraft:oak_log");
        assert_eq!(codec().encode(&oak_log), Some((17, 0)));

        let stairs = normalize_block_for_legacy(
            "1.7.10",
            &block(
                "minecraft:oak_stairs",
                &[
                    ("facing", "north"),
                    ("half", "bottom"),
                    ("shape", "straight"),
                    ("waterlogged", "true"),
                ],
            ),
        )
        .unwrap();
        assert_eq!(stairs.id.name.as_ref(), "minecraft:oak_stairs");
        assert!(!stairs.properties.contains_key("waterlogged"));
        assert_eq!(codec().encode(&stairs).map(|(id, _)| id), Some(53));

        let unsupported_shape = normalize_block_for_legacy(
            "1.7.10",
            &block(
                "minecraft:oak_stairs",
                &[
                    ("facing", "north"),
                    ("half", "bottom"),
                    ("shape", "outer_left"),
                ],
            ),
        )
        .unwrap();
        assert_eq!(
            unsupported_shape
                .properties
                .get("facing")
                .map(AsRef::as_ref),
            Some("north")
        );
        assert_eq!(
            unsupported_shape.properties.get("half").map(AsRef::as_ref),
            Some("bottom")
        );

        let air = normalize_block_for_legacy("1.7.10", &block("minecraft:cave_air", &[])).unwrap();
        assert_eq!(air.id.name.as_ref(), "minecraft:air");
        assert_eq!(codec().encode(&air), Some((0, 0)));
    }

    #[test]
    fn falls_back_new_blocks_without_emitting_post_1_7_ids() {
        let deepslate =
            normalize_block_for_legacy("1.7.10", &block("minecraft:deepslate", &[])).unwrap();
        assert_eq!(deepslate.id.name.as_ref(), "minecraft:stone");

        let copper_bulb = normalize_block_for_legacy(
            "1.7.10",
            &block(
                "minecraft:copper_bulb",
                &[
                    ("lit", "true"),
                    ("powered", "false"),
                    ("waterlogged", "false"),
                ],
            ),
        )
        .unwrap();
        assert_eq!(copper_bulb.id.name.as_ref(), "minecraft:redstone_lamp");
        assert_eq!(codec().encode(&copper_bulb), Some((124, 0)));

        let unknown =
            normalize_block_for_legacy("1.7.10", &block("minecraft:cherry_planks", &[])).unwrap();
        assert_eq!(unknown.id.name.as_ref(), "minecraft:oak_planks");
        let (id, _) = codec().encode(&unknown).unwrap();
        assert!(id <= 175);

        let wall_sign =
            normalize_block_for_legacy("1.7.10", &block("minecraft:oak_wall_sign", &[])).unwrap();
        assert_eq!(wall_sign.id.name.as_ref(), "minecraft:wall_sign");
        assert_eq!(codec().encode(&wall_sign).map(|(id, _)| id), Some(68));

        let waxed_copper = normalize_block_for_legacy(
            "1.7.10",
            &block("minecraft:waxed_oxidized_cut_copper", &[]),
        )
        .unwrap();
        assert_eq!(waxed_copper.id.name.as_ref(), "minecraft:iron_block");
        assert_eq!(codec().encode(&waxed_copper), Some((42, 0)));

        let deepslate_ore =
            normalize_block_for_legacy("1.7.10", &block("minecraft:deepslate_diamond_ore", &[]))
                .unwrap();
        assert_eq!(deepslate_ore.id.name.as_ref(), "minecraft:diamond_ore");
        assert_eq!(codec().encode(&deepslate_ore), Some((56, 0)));

        let stripped_cherry_log =
            normalize_block_for_legacy("1.7.10", &block("minecraft:stripped_cherry_log", &[]))
                .unwrap();
        assert_eq!(stripped_cherry_log.id.name.as_ref(), "minecraft:oak_log");
        assert_eq!(codec().encode(&stripped_cherry_log), Some((17, 0)));
    }

    #[test]
    fn respects_palette_boundaries_for_intermediate_targets() {
        let shulker = block("minecraft:white_shulker_box", &[]);
        let old = normalize_block_for_legacy("1.10.2", &shulker).unwrap();
        assert_eq!(codec().encode(&old).map(|(id, _)| id), Some(35));

        let modern = normalize_block_for_legacy("1.12.2", &shulker).unwrap();
        assert_eq!(codec().encode(&modern).map(|(id, _)| id), Some(219));

        let slime =
            normalize_block_for_legacy("1.8.9", &block("minecraft:slime_block", &[])).unwrap();
        assert_eq!(slime.id.name.as_ref(), "minecraft:slime_block");
        assert_eq!(codec().encode(&slime).map(|(id, _)| id), Some(165));

        let mossy_wall =
            normalize_block_for_legacy("1.7.10", &block("minecraft:mossy_cobblestone_wall", &[]))
                .unwrap();
        assert_eq!(
            mossy_wall.id.name.as_ref(),
            "minecraft:mossy_cobblestone_wall"
        );
        assert_eq!(codec().encode(&mossy_wall).map(|(id, _)| id), Some(139));
    }

    #[test]
    fn maps_modern_workstations_to_usable_legacy_blocks() {
        for (modern, legacy) in [
            ("minecraft:barrel", "minecraft:chest"),
            ("minecraft:smoker", "minecraft:furnace"),
            ("minecraft:blast_furnace", "minecraft:furnace"),
            ("minecraft:grindstone", "minecraft:anvil"),
            ("minecraft:bell", "minecraft:anvil"),
            ("minecraft:lectern", "minecraft:bookshelf"),
            ("minecraft:stonecutter", "minecraft:crafting_table"),
            ("minecraft:composter", "minecraft:cauldron"),
        ] {
            let normalized = normalize_block_for_legacy("1.7.10", &block(modern, &[])).unwrap();
            assert_eq!(normalized.id.name.as_ref(), legacy);
            assert!(codec().encode(&normalized).is_some(), "{modern}");
        }
    }

    #[test]
    fn rewrites_common_modern_tile_entity_ids() {
        assert_eq!(legacy_tile_entity_id("minecraft:barrel"), Some("Chest"));
        assert_eq!(legacy_tile_entity_id("minecraft:smoker"), Some("Furnace"));
        assert_eq!(legacy_tile_entity_id("minecraft:oak_sign"), Some("Sign"));
        assert_eq!(
            legacy_tile_entity_id("minecraft:trapped_chest"),
            Some("Chest")
        );
        assert_eq!(
            legacy_tile_entity_id("minecraft:command_block"),
            Some("Control")
        );
        assert_eq!(legacy_tile_entity_id("minecraft:unknown"), None);

        let mut source = TileEntitiesList::new();
        source.elements.push(TileEntities {
            pos: BlockPos { x: 0, y: 0, z: 0 },
            nbt: fastnbt::Value::Compound(
                [(
                    "id".to_string(),
                    fastnbt::Value::String("minecraft:banner".to_string()),
                )]
                .into_iter()
                .collect(),
            ),
        });
        source.elements.push(TileEntities {
            pos: BlockPos { x: 1, y: 0, z: 0 },
            nbt: fastnbt::Value::Compound(
                [(
                    "id".to_string(),
                    fastnbt::Value::String("minecraft:chest".to_string()),
                )]
                .into_iter()
                .collect(),
            ),
        });
        let normalized = normalize_tile_entities(&source);
        assert_eq!(normalized.elements.len(), 1);
        let fastnbt::Value::Compound(map) = &normalized.elements[0].nbt else {
            panic!("normalized tile entity should be a compound");
        };
        assert_eq!(
            map.get("id").and_then(fastnbt::Value::as_str),
            Some("Chest")
        );
    }

    #[test]
    fn converts_modern_sign_text_to_legacy_fields() {
        let mut front_text = HashMap::new();
        front_text.insert(
            "messages".to_string(),
            fastnbt::Value::List(vec![
                fastnbt::Value::String("{\"text\":\"Line one\"}".to_string()),
                fastnbt::Value::String("{\"text\":\"Line two\"}".to_string()),
            ]),
        );
        let mut sign = HashMap::new();
        sign.insert(
            "id".to_string(),
            fastnbt::Value::String("minecraft:oak_sign".to_string()),
        );
        sign.insert(
            "front_text".to_string(),
            fastnbt::Value::Compound(front_text),
        );
        sign.insert(
            "back_text".to_string(),
            fastnbt::Value::Compound(HashMap::new()),
        );
        sign.insert("is_waxed".to_string(), fastnbt::Value::Byte(0));

        let source = TileEntitiesList {
            original_type: 2,
            elements: vec![TileEntities {
                pos: BlockPos { x: 0, y: 0, z: 0 },
                nbt: fastnbt::Value::Compound(sign),
            }],
        };
        let normalized = normalize_tile_entities(&source);
        let fastnbt::Value::Compound(map) = &normalized.elements[0].nbt else {
            panic!("normalized sign should be a compound");
        };

        assert_eq!(map.get("id").and_then(fastnbt::Value::as_str), Some("Sign"));
        assert_eq!(
            map.get("Text1").and_then(fastnbt::Value::as_str),
            Some("{\"text\":\"Line one\"}")
        );
        assert_eq!(
            map.get("Text3").and_then(fastnbt::Value::as_str),
            Some("{\"text\":\"\"}")
        );
        assert!(!map.contains_key("front_text"));
        assert!(!map.contains_key("back_text"));
    }

    #[test]
    fn rejects_unknown_legacy_target() {
        let error =
            normalize_block_for_legacy("1.13.2", &block("minecraft:stone", &[])).unwrap_err();
        assert!(error.to_string().contains("unknown legacy target version"));
    }
}
