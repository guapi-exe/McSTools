use crate::utils::block_state_pos_list::{BlockData, BlockId};
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, OnceLock};

/// Authoritative Bedrock -> Java block state mapping from PrismarineJS
/// minecraft-data (1.20.0):
/// https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.20.0/blocksB2J.json
const B2J_DATA: &str = include_str!("../../data/bedrock_blocks_b2j.json");

/// Authoritative Java -> Bedrock block state mapping from the same source:
/// https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.20.0/blocksJ2B.json
const J2B_DATA: &str = include_str!("../../data/bedrock_blocks_j2b.json");

static MAP: OnceLock<BedrockBlockMap> = OnceLock::new();

type StateKey = (Arc<str>, BTreeMap<Arc<str>, Arc<str>>);

#[derive(Debug, Clone)]
struct StateCandidate {
    source_properties: BTreeMap<Arc<str>, Arc<str>>,
    mapped: Arc<BlockData>,
}

/// Bedrock block-state <-> Java block-state mapping.
#[derive(Debug, Clone)]
pub struct BedrockBlockMap {
    b2j: HashMap<StateKey, Arc<BlockData>>,
    j2b: HashMap<StateKey, Arc<BlockData>>,
    b2j_by_name: HashMap<Arc<str>, Vec<StateCandidate>>,
    j2b_by_name: HashMap<Arc<str>, Vec<StateCandidate>>,
}

impl BedrockBlockMap {
    fn new() -> Self {
        let b2j_raw: HashMap<String, String> = serde_json::from_str(B2J_DATA)
            .expect("failed to parse bundled bedrock_blocks_b2j.json");
        let j2b_raw: HashMap<String, String> = serde_json::from_str(J2B_DATA)
            .expect("failed to parse bundled bedrock_blocks_j2b.json");

        let mut b2j = HashMap::new();
        let mut b2j_by_name: HashMap<Arc<str>, Vec<StateCandidate>> = HashMap::new();
        for (bedrock, java) in b2j_raw {
            let (bedrock_name, bedrock_properties) = parse_state(&bedrock);
            let (java_name, java_properties) = parse_state(&java);

            let java_block = Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from(java_name.as_str()),
                },
                properties: java_properties.clone(),
            });

            let source_name = Arc::<str>::from(bedrock_name.as_str());
            b2j.entry((source_name.clone(), bedrock_properties.clone()))
                .or_insert(java_block.clone());
            b2j_by_name
                .entry(source_name)
                .or_default()
                .push(StateCandidate {
                    source_properties: bedrock_properties,
                    mapped: java_block,
                });
        }

        let mut j2b = HashMap::new();
        let mut j2b_by_name: HashMap<Arc<str>, Vec<StateCandidate>> = HashMap::new();
        for (java, bedrock) in j2b_raw {
            let (java_name, java_properties) = parse_state(&java);
            let (bedrock_name, bedrock_properties) = parse_state(&bedrock);

            let bedrock_block = Arc::new(BlockData {
                id: BlockId {
                    name: Arc::<str>::from(bedrock_name.as_str()),
                },
                properties: bedrock_properties.clone(),
            });

            let source_name = Arc::<str>::from(java_name.as_str());
            j2b.entry((source_name.clone(), java_properties.clone()))
                .or_insert(bedrock_block.clone());
            j2b_by_name
                .entry(source_name)
                .or_default()
                .push(StateCandidate {
                    source_properties: java_properties,
                    mapped: bedrock_block,
                });
        }

        // JSON objects have no ordering. Sort fallback candidates so default
        // state selection is deterministic across runs and platforms.
        for candidates in b2j_by_name.values_mut().chain(j2b_by_name.values_mut()) {
            candidates.sort_by(|left, right| {
                default_state_score("", &right.source_properties)
                    .cmp(&default_state_score("", &left.source_properties))
                    .then_with(|| {
                        state_order(&left.source_properties)
                            .cmp(&state_order(&right.source_properties))
                    })
            });
            candidates.dedup_by(|left, right| {
                left.source_properties == right.source_properties && left.mapped == right.mapped
            });
        }

        Self {
            b2j,
            j2b,
            b2j_by_name,
            j2b_by_name,
        }
    }

    pub fn to_java(&self, block: &BlockData) -> Option<Arc<BlockData>> {
        self.lookup(&self.b2j, &self.b2j_by_name, block)
    }

    pub fn to_bedrock(&self, block: &BlockData) -> Option<Arc<BlockData>> {
        self.lookup(&self.j2b, &self.j2b_by_name, block)
    }

    pub fn java_supports_property(&self, block_name: &str, property: &str) -> bool {
        let name: Arc<str> = if block_name.contains(':') {
            Arc::from(block_name)
        } else {
            Arc::from(format!("minecraft:{block_name}"))
        };
        self.j2b_by_name.get(&name).is_some_and(|candidates| {
            candidates
                .iter()
                .any(|candidate| candidate.source_properties.contains_key(property))
        })
    }

    fn lookup(
        &self,
        map: &HashMap<StateKey, Arc<BlockData>>,
        by_name: &HashMap<Arc<str>, Vec<StateCandidate>>,
        block: &BlockData,
    ) -> Option<Arc<BlockData>> {
        let name = if block.id.name.contains(':') {
            block.id.name.clone()
        } else {
            Arc::<str>::from(format!("minecraft:{}", block.id.name))
        };
        let key = (name.clone(), block.properties.clone());
        for properties in state_variants(&key.1) {
            if let Some(mapped) = map.get(&(name.clone(), properties)) {
                return Some(mapped.clone());
            }
        }

        // A state table normally contains every legal combination, but real
        // files often omit defaults or carry an extra property from another
        // game release. Match the most specific compatible state instead of
        // failing the whole schematic conversion.
        let candidates = by_name.get(&name)?;
        let mut best: Option<((i32, i32, i32, i32, i32, i32), Arc<BlockData>)> = None;
        for (order, candidate) in candidates.iter().enumerate() {
            let (matched, conflicts, missing) =
                compare_properties(&key.1, &candidate.source_properties);
            let identity = i32::from(candidate.mapped.id.name == name);
            let score = (
                matched,
                -conflicts,
                -missing,
                identity,
                default_state_score(name.as_ref(), &candidate.source_properties),
                -(order as i32),
            );
            if best
                .as_ref()
                .map_or(true, |(best_score, _)| score > *best_score)
            {
                best = Some((score, candidate.mapped.clone()));
            }
        }
        best.map(|(_, mapped)| mapped)
    }
}

fn state_order(properties: &BTreeMap<Arc<str>, Arc<str>>) -> String {
    properties
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join(",")
}

fn canonical_bool(value: &str) -> Option<bool> {
    match value {
        "0" | "false" => Some(false),
        "1" | "true" => Some(true),
        _ => None,
    }
}

fn values_equal(left: &str, right: &str) -> bool {
    left == right
        || (canonical_bool(left).is_some() && canonical_bool(left) == canonical_bool(right))
}

fn state_variants(properties: &BTreeMap<Arc<str>, Arc<str>>) -> Vec<BTreeMap<Arc<str>, Arc<str>>> {
    let mut variants = vec![properties.clone()];
    for key in properties.keys() {
        let Some(alias) = properties.get(key).and_then(|value| match value.as_ref() {
            "0" => Some("false"),
            "1" => Some("true"),
            "false" => Some("0"),
            "true" => Some("1"),
            _ => None,
        }) else {
            continue;
        };
        let current = variants.clone();
        for mut variant in current {
            variant.insert(key.clone(), Arc::<str>::from(alias));
            variants.push(variant);
        }
    }
    variants
}

fn compare_properties(
    input: &BTreeMap<Arc<str>, Arc<str>>,
    candidate: &BTreeMap<Arc<str>, Arc<str>>,
) -> (i32, i32, i32) {
    let mut matched = 0;
    let mut conflicts = 0;
    for (key, value) in input {
        match candidate.get(key) {
            Some(candidate_value) if values_equal(value, candidate_value) => matched += 1,
            Some(_) => conflicts += 1,
            None => {}
        }
    }
    let missing = candidate
        .keys()
        .filter(|key| !input.contains_key(*key))
        .count() as i32;
    (matched, conflicts, missing)
}

fn default_state_score(name: &str, properties: &BTreeMap<Arc<str>, Arc<str>>) -> i32 {
    properties
        .iter()
        .map(|(key, value)| {
            let value = value.as_ref();
            let expected = match key.as_ref() {
                "axis" | "pillar_axis" => Some("y"),
                "facing" | "direction" => Some("north"),
                "half" => Some("bottom"),
                "shape" => Some("straight"),
                "face" => Some("floor"),
                "hinge" => Some("left"),
                "type" if name.ends_with("_slab") => Some("bottom"),
                "type" if name.ends_with("chest") => Some("single"),
                "type" => None,
                "delay" => Some("1"),
                "level" | "rotation" | "age" | "age_bit" | "growth" | "stage" => Some("0"),
                "distance" => Some("1"),
                "waterlogged" | "open" | "powered" | "lit" | "locked" | "hanging"
                | "persistent" | "berries" | "unstable" | "conditional" | "triggered"
                | "extended" | "attached" | "in_wall" | "snowy" => Some("false"),
                "upside_down_bit" | "door_hinge_bit" | "upper_block_bit" | "open_bit" => {
                    Some("false")
                }
                _ => None,
            };

            match expected {
                Some(expected) if canonical_bool(value).is_some() => {
                    i32::from(canonical_bool(value) != canonical_bool(expected))
                }
                Some(expected) => i32::from(value != expected),
                None => 0,
            }
        })
        .sum::<i32>()
        .saturating_neg()
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
        properties.insert(Arc::<str>::from(key.trim()), Arc::<str>::from(value.trim()));
    }

    (head.trim().to_string(), properties)
}

pub fn bedrock_map() -> &'static BedrockBlockMap {
    MAP.get_or_init(BedrockBlockMap::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn block(name: &str) -> BlockData {
        BlockData {
            id: BlockId {
                name: Arc::<str>::from(name),
            },
            properties: BTreeMap::new(),
        }
    }

    #[test]
    fn parses_bundled_bedrock_mapping_tables() {
        let map = BedrockBlockMap::new();
        assert!(!map.b2j.is_empty());
        assert!(!map.j2b.is_empty());

        let java_gold = map.to_java(&block("minecraft:gold_block")).unwrap();
        assert_eq!(java_gold.id.name.as_ref(), "minecraft:gold_block");

        let bedrock_gold = map.to_bedrock(&block("minecraft:gold_block")).unwrap();
        assert_eq!(bedrock_gold.id.name.as_ref(), "minecraft:gold_block");
    }

    #[test]
    fn matches_numeric_bedrock_byte_states() {
        let map = BedrockBlockMap::new();
        let mut sapling = block("minecraft:sapling");
        sapling
            .properties
            .insert(Arc::<str>::from("age_bit"), Arc::<str>::from("0"));
        sapling
            .properties
            .insert(Arc::<str>::from("sapling_type"), Arc::<str>::from("oak"));

        let java = map
            .to_java(&sapling)
            .expect("numeric byte state should map");
        assert_eq!(java.id.name.as_ref(), "minecraft:oak_sapling");
        assert_eq!(java.properties.get("stage").map(AsRef::as_ref), Some("0"));
    }

    #[test]
    fn boolean_state_aliases_never_flip_the_state_value() {
        let properties = [(Arc::<str>::from("drag_down"), Arc::<str>::from("1"))]
            .into_iter()
            .collect();
        let variants = state_variants(&properties);

        assert!(variants
            .iter()
            .any(|variant| { variant.get("drag_down").map(AsRef::as_ref) == Some("true") }));
        assert!(variants.iter().all(|variant| {
            !matches!(
                variant.get("drag_down").map(AsRef::as_ref),
                Some("0" | "false")
            )
        }));
    }

    #[test]
    fn reports_java_waterloggable_blocks_from_the_mapping_table() {
        let map = BedrockBlockMap::new();
        assert!(map.java_supports_property("minecraft:oak_stairs", "waterlogged"));
        assert!(map.java_supports_property("oak_trapdoor", "waterlogged"));
        assert!(!map.java_supports_property("minecraft:stone", "waterlogged"));
    }

    #[test]
    fn resolves_java_default_state_when_source_omits_properties() {
        let map = BedrockBlockMap::new();
        let oak_log = map
            .to_bedrock(&block("minecraft:oak_log"))
            .expect("oak log should use its default axis");
        assert_eq!(oak_log.id.name.as_ref(), "minecraft:oak_log");
        assert_eq!(
            oak_log.properties.get("pillar_axis").map(AsRef::as_ref),
            Some("y")
        );

        let redstone_ore = map
            .to_bedrock(&block("minecraft:redstone_ore"))
            .expect("redstone ore should use its unlit default");
        assert_eq!(redstone_ore.id.name.as_ref(), "minecraft:redstone_ore");
        assert!(redstone_ore.properties.is_empty());
    }

    #[test]
    fn preserves_known_properties_when_other_state_values_are_missing() {
        let map = BedrockBlockMap::new();
        let mut stairs = block("minecraft:oak_stairs");
        stairs
            .properties
            .insert(Arc::<str>::from("facing"), Arc::<str>::from("north"));
        stairs
            .properties
            .insert(Arc::<str>::from("half"), Arc::<str>::from("bottom"));

        let bedrock = map.to_bedrock(&stairs).expect("partial stair state");
        assert_eq!(
            bedrock.properties.get("upside_down_bit").map(AsRef::as_ref),
            Some("false")
        );
        assert_eq!(
            bedrock
                .properties
                .get("weirdo_direction")
                .map(AsRef::as_ref),
            Some("3")
        );
    }

    #[test]
    fn chooses_semantic_defaults_for_states_with_omitted_properties() {
        let map = BedrockBlockMap::new();

        let slab = map
            .to_bedrock(&block("minecraft:stone_slab"))
            .expect("stone slab default");
        assert_eq!(
            slab.properties.get("stone_slab_type_4").map(AsRef::as_ref),
            Some("stone")
        );

        let door = map
            .to_bedrock(&block("minecraft:oak_door"))
            .expect("oak door default");
        assert_eq!(
            door.properties.get("upper_block_bit").map(AsRef::as_ref),
            Some("false")
        );
        assert_eq!(
            door.properties.get("door_hinge_bit").map(AsRef::as_ref),
            Some("false")
        );

        let repeater = map
            .to_bedrock(&block("minecraft:repeater"))
            .expect("repeater default");
        assert_eq!(
            repeater.properties.get("repeater_delay").map(AsRef::as_ref),
            Some("0")
        );
    }
}
