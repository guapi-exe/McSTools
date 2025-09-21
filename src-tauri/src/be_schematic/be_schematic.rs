use std::fs::File;
use std::io::Read;
use std::sync::Arc;
use std::collections::{BTreeMap, HashMap};

use fastnbt::Value;
use fastnbt::Value::Compound;

use crate::be_schematic::le_reader::read_nbt_le::load_nbt_le;
use crate::utils::extend_value::NbtExt;
use crate::utils::schematic_data::{SchematicData, SchematicError, Size};
use crate::utils::block_state_pos_list::{BlockData, BlockId, BlockPos, BlockStatePosList};
use crate::utils::entities::EntitiesList;
use crate::utils::tile_entities::TileEntitiesList;

#[derive(Debug)]
pub struct BESchematic {
    pub nbt: Value,
}

impl BESchematic {
    /// 从文件构造
    pub fn new(file_path: &str) -> Result<Self, SchematicError> {
        let mut file = File::open(file_path)?;
        let mut buf = Vec::new();
        file.read_to_end(&mut buf)?;
        Self::new_from_bytes(buf)
    }

    /// 从字节数组构造
    pub fn new_from_bytes(data: Vec<u8>) -> Result<Self, SchematicError> {
        let nbt = load_nbt_le(&data[..])?;
        let value = Compound(nbt);

        if matches!(value, Compound(_)) {
            Ok(Self { nbt: value })
        } else {
            Err(SchematicError::InvalidFormat("Root is not a Compound"))
        }
    }

    /// 获取格式版本
    pub fn get_format_version(&self) -> Result<i32, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        root.get_i32("format_version")
    }

    /// 获取结构尺寸
    pub fn get_size(&self) -> Result<Size, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };

        let list = root.get_list("size")?;
        let dims: Vec<i32> = list.iter()
            .filter_map(|v| if let Value::Int(n) = v { Some(*n) } else { None })
            .collect();

        if dims.len() != 3 {
            return Err(SchematicError::InvalidFormat("size must be 3 ints"));
        }

        Ok(Size {
            width: dims[0],
            height: dims[1],
            length: dims[2],
        })
    }

    /// 获取结构 Compound
    pub fn get_structure(&self) -> Result<&HashMap<String, Value>, SchematicError> {
        let Compound(root) = &self.nbt else {
            return Err(SchematicError::InvalidFormat("Root is not a Compound"));
        };
        let Compound(structure) = root.get("structure")
            .ok_or(SchematicError::InvalidFormat("Missing structure field"))? else {
            return Err(SchematicError::InvalidFormat("structure must be Compound"));
        };
        Ok(structure)
    }

    /// 解析 Palette
    pub fn parse_block_palette(
        &self,
        structure: &HashMap<String, Value>,
    ) -> Result<Vec<Arc<BlockData>>, SchematicError> {
        let Value::Compound(palette_comp) = structure
            .get("palette")
            .ok_or(SchematicError::InvalidFormat("Missing palette"))? else {
            return Err(SchematicError::InvalidFormat("palette must be a Compound"));
        };

        let Value::Compound(default_comp) = palette_comp
            .get("default")
            .ok_or(SchematicError::InvalidFormat("Missing default palette"))? else {
            return Err(SchematicError::InvalidFormat("default palette must be a Compound"));
        };

        let Value::List(palette_list) = default_comp
            .get("block_palette")
            .ok_or(SchematicError::InvalidFormat("Missing block_palette"))? else {
            return Err(SchematicError::InvalidFormat("block_palette must be a List"));
        };

        let mut palette = Vec::with_capacity(palette_list.len());
        for entry in palette_list {
            let block = Self::parse_palette_entry(entry)?;
            palette.push(Arc::new(block));
        }
        Ok(palette)
    }

    /// 解析单个 Palette entry
    fn parse_palette_entry(value: &Value) -> Result<BlockData, SchematicError> {
        let Compound(root) = value else {
            return Err(SchematicError::InvalidFormat("block_palette entry must be Compound"));
        };

        let name = root
            .get("name")
            .and_then(|v| v.as_str())
            .map(Arc::<str>::from)
            .unwrap_or_else(|| Arc::from("minecraft:air"));

        let properties = Self::parse_block_states(root.get("states"));

        Ok(BlockData {
            id: BlockId { name },
            properties,
        })
    }

    /// 解析 Block states
    fn parse_block_states(states_value: Option<&Value>) -> BTreeMap<Arc<str>, Arc<str>> {
        let mut properties = BTreeMap::new();

        if let Some(Compound(prop_map)) = states_value {
            for (k, v) in prop_map {
                let value = match v {
                    Value::String(s) => s.clone(),
                    Value::Int(n) => n.to_string(),
                    Value::Byte(b) => (*b != 0).to_string(),
                    _ => v.as_str().unwrap().to_string(),
                };
                properties.insert(Arc::<str>::from(k.as_str()), Arc::<str>::from(value.as_str()));
            }
        }
        properties
    }

    /// 解析 block_indices，生成 SchematicData
    pub fn get_blocks_pos(&self) -> Result<SchematicData, SchematicError> {
        let structure = self.get_structure()?;

        let size = self.get_size()?;
        let palette = self.parse_block_palette(structure)?;

        let Value::List(block_indices) = structure.get("block_indices")
            .ok_or(SchematicError::InvalidFormat("Missing block_indices"))? else {
            return Err(SchematicError::InvalidFormat("block_indices must be a List"));
        };

        let mut block_list = BlockStatePosList::default();

        // 主层
        if let Some(Value::List(layer0)) = block_indices.get(0) {
            self.parse_block_layer(layer0, &palette, &size, &mut block_list)?;
        }

        // 副层（水、液体）
        /*
        if let Some(Value::List(layer1)) = block_indices.get(1) {
            self.parse_block_layer(layer1, &palette, &size, &mut block_list)?;
        }
         */

        let tile_entities = TileEntitiesList::default();
        Ok(SchematicData::new(block_list, tile_entities, EntitiesList::default(), size))
    }

    fn parse_block_layer(
        &self,
        layer: &[Value],
        palette: &[Arc<BlockData>],
        size: &Size,
        block_list: &mut BlockStatePosList,
    ) -> Result<(), SchematicError> {
        for (i, v) in layer.iter().enumerate() {
            if let Value::Int(state_id) = v {
                if *state_id >= 0 {
                    let pos = Self::index_to_pos(i as i32, size);
                    let block_data = palette.get(*state_id as usize)
                        .ok_or(SchematicError::InvalidFormat("Invalid state_id in block_indices"))?;
                    block_list.add(pos, Arc::clone(block_data));
                }
            }
        }
        Ok(())
    }

    /// 一维索引 -> 三维坐标
    fn index_to_pos(index: i32, size: &Size) -> BlockPos {
        let z = index % size.length;
        let y = (index / size.length) % size.height;
        let x = index / (size.length * size.height);
        BlockPos { x, y, z }
    }
}
