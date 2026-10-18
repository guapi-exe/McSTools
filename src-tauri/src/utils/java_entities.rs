//! Entity payloads shared by Java output formats; never discard an unsupported
//! payload to make an export appear successful.
use crate::utils::entities::{Entities, EntitiesList};
use crate::utils::schematic_data::SchematicError;
use crate::utils::schematic_editing::{entity_position, shift_position};
use fastnbt::{Value, Value::Compound};
use std::collections::HashMap;

pub(crate) fn java_entity_data(
    value: &Value,
    source_type: i32,
) -> Result<(String, HashMap<String, Value>), SchematicError> {
    // Type 4 is the legacy MCEdit/WorldEdit `.schematic` representation and
    // type 5 is Bedrock `.mcstructure`. Both carry block entities as a
    // compound with an id and coordinates. Normalize their bare Bedrock /
    // legacy ids to namespaced Java ids while retaining the remaining data.
    if !matches!(source_type, 1 | 2 | 3 | 4 | 5) {
        return Err(SchematicError::InvalidFormat(
            "Entity conversion from this source format to Sponge is not supported; source data was not discarded",
        ));
    }
    let Compound(root) = value else {
        return Err(SchematicError::InvalidFormat(
            "Entity NBT must be a compound",
        ));
    };
    let id = root
        .get("Id")
        .or_else(|| root.get("id"))
        .or_else(|| root.get("identifier"));
    let Some(Value::String(id)) = id else {
        return Err(SchematicError::InvalidFormat(
            "Entity NBT requires a string id",
        ));
    };
    let mut data = if source_type == 3
        && root.contains_key("Data")
        && root
            .keys()
            .all(|key| matches!(key.as_str(), "Id" | "Pos" | "Data"))
    {
        match root.get("Data") {
            Some(Compound(data)) => data.clone(),
            _ => {
                return Err(SchematicError::InvalidFormat(
                    "Sponge entity Data must be a compound",
                ));
            }
        }
    } else {
        root.clone()
    };
    data.remove("Id");
    data.remove("id");
    Ok((normalize_entity_id(id, source_type), data))
}

fn normalize_entity_id(id: &str, source_type: i32) -> String {
    if id.contains(':') {
        return id.to_owned();
    }
    // Bedrock uses identifiers such as `Chest` and `Sign`; legacy MCEdit
    // files use the same spelling. Sponge requires a namespaced id.
    let normalized = match id {
        "Chest" | "TrappedChest" => "chest",
        "Sign" => "sign",
        "HangingSign" => "hanging_sign",
        "Banner" => "banner",
        "Skull" | "MobHead" => "skull",
        "ArmorStand" => "armor_stand",
        "ItemFrame" => "item_frame",
        "GlowItemFrame" => "glow_item_frame",
        "MinecartChest" => "chest_minecart",
        "MinecartRideable" => "minecart",
        "Furnace" => "furnace",
        "BlastFurnace" => "blast_furnace",
        "Smoker" => "smoker",
        "Hopper" => "hopper",
        "Dropper" => "dropper",
        "Dispenser" => "dispenser",
        "ShulkerBox" => "shulker_box",
        "Barrel" => "barrel",
        "Beacon" => "beacon",
        "BrewingStand" => "brewing_stand",
        "CommandBlock" => "command_block",
        other => other,
    };
    // Keep unknown ids usable for conversion while making the source format
    // explicit in the fallback path. This is preferable to dropping a block
    // entity and losing user data.
    let _ = source_type;
    format!("minecraft:{}", normalized.to_ascii_lowercase())
}

pub(crate) fn local_java_entities(
    source: &EntitiesList,
    origin: [i32; 3],
) -> Result<EntitiesList, SchematicError> {
    let mut elements = Vec::with_capacity(source.elements.len());
    for entity in &source.elements {
        let Compound(root) = &entity.nbt else {
            return Err(SchematicError::InvalidFormat(
                "Entity NBT must be a compound",
            ));
        };
        let payload = if source.original_type == 1 {
            root.get("nbt").unwrap_or(&entity.nbt)
        } else {
            &entity.nbt
        };
        let (id, mut data) = java_entity_data(payload, source.original_type)?;
        let pos = entity_position(&entity.nbt)
            .or_else(|| entity_position(payload))
            .ok_or(SchematicError::InvalidFormat(
                "entity requires 3 finite position coordinates; source data was not discarded",
            ))?;
        data.insert("id".into(), Value::String(id));
        data.remove("pos");
        data.insert(
            "Pos".into(),
            Value::List(pos.into_iter().map(Value::Double).collect()),
        );
        let mut nbt = Compound(data);
        shift_position(&mut nbt, origin).map_err(|_| {
            SchematicError::InvalidFormat("entity coordinates cannot be safely rebased for export")
        })?;
        let local = entity_position(&nbt).ok_or(SchematicError::InvalidFormat(
            "invalid local entity position",
        ))?;
        if local
            .iter()
            .any(|v| *v < f64::from(i32::MIN) || *v >= f64::from(i32::MAX) + 1.0)
        {
            return Err(SchematicError::InvalidFormat(
                "entity block anchor exceeds i32 bounds",
            ));
        }
        elements.push(Entities { nbt });
    }
    Ok(EntitiesList {
        original_type: 2,
        elements,
    })
}
