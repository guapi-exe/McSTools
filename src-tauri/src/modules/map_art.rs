use crate::building_gadges::to_bg_schematic::ToBgSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::data_files::files::FileManager;
use crate::database::db_apis::history_api::new_history;
use crate::database::db_apis::schematic_data_api::new_schematic_data;
use crate::database::db_apis::schematics_api::new_schematic;
use crate::database::db_apis::user_api::add_user_schematic;
use crate::database::db_control::DatabaseState;
use crate::database::db_data::Schematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::modules::modules_data::convert_data::get_unique_block_str;
use crate::utils::block_state_pos_list::{BlockStatePos, BlockStatePosList};
use crate::utils::minecraft_data::je_blocks_data::BlocksData;
use crate::utils::requirements::{get_requirements, RequirementStr};
use crate::utils::schematic_data::{SchematicData, Size};
use crate::utils::tile_entities::TileEntitiesList;
use crate::word_edit::to_we_schematic::ToWeSchematic;
use chrono::Local;
use crate::utils::entities::{EntitiesList};
use std::collections::VecDeque;
use std::collections::BTreeMap;
use std::sync::Arc;
use tauri::State;
use crate::be_schematic::to_be_schematic::ToBESchematic;

#[derive(serde::Deserialize)]
pub struct MapArtColorEntry {
    #[serde(rename = "blockId")]
    pub block_id: String,
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

#[derive(serde::Deserialize, Clone)]
pub struct MapArtColorOptions {
    #[serde(rename = "matchMode")]
    pub match_mode: String,
    pub brightness: f32,
    pub contrast: f32,
    pub saturation: f32,
    pub gamma: f32,
}

fn clamp_u8(v: f32) -> u8 {
    if v <= 0.0 {
        0
    } else if v >= 255.0 {
        255
    } else {
        v.round() as u8
    }
}

fn build_block(name: &str) -> Arc<crate::utils::block_state_pos_list::BlockData> {
    Arc::new(crate::utils::block_state_pos_list::BlockData {
        id: crate::utils::block_state_pos_list::BlockId {
            name: format!("minecraft:{}", name).into(),
        },
        properties: BTreeMap::new(),
    })
}

fn adjust_color(r: u8, g: u8, b: u8, options: &MapArtColorOptions) -> (u8, u8, u8) {
    let mut rf = (r as f32) / 255.0;
    let mut gf = (g as f32) / 255.0;
    let mut bf = (b as f32) / 255.0;

    let gamma = if options.gamma <= 0.01 { 1.0 } else { options.gamma };
    rf = rf.powf(1.0 / gamma);
    gf = gf.powf(1.0 / gamma);
    bf = bf.powf(1.0 / gamma);

    let sat = options.saturation.clamp(0.0, 2.0);
    let luma = 0.2126 * rf + 0.7152 * gf + 0.0722 * bf;
    rf = luma + (rf - luma) * sat;
    gf = luma + (gf - luma) * sat;
    bf = luma + (bf - luma) * sat;

    let contrast = options.contrast.clamp(0.2, 2.0);
    rf = ((rf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);
    gf = ((gf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);
    bf = ((bf - 0.5) * contrast + 0.5).clamp(0.0, 1.0);

    let bright = options.brightness.clamp(0.2, 2.0);
    rf = (rf * bright).clamp(0.0, 1.0);
    gf = (gf * bright).clamp(0.0, 1.0);
    bf = (bf * bright).clamp(0.0, 1.0);

    (clamp_u8(rf * 255.0), clamp_u8(gf * 255.0), clamp_u8(bf * 255.0))
}

fn color_distance(mode: &str, r1: u8, g1: u8, b1: u8, r2: u8, g2: u8, b2: u8) -> f32 {
    let dr = r1 as f32 - r2 as f32;
    let dg = g1 as f32 - g2 as f32;
    let db = b1 as f32 - b2 as f32;

    match mode {
        "weighted" => 2.0 * dr * dr + 4.0 * dg * dg + 3.0 * db * db,
        "redmean" => {
            let rmean = (r1 as f32 + r2 as f32) / 2.0;
            ((2.0 + rmean / 256.0) * dr * dr) + 4.0 * dg * dg + ((2.0 + (255.0 - rmean) / 256.0) * db * db)
        }
        _ => dr * dr + dg * dg + db * db,
    }
}

fn nearest_block(
    r: u8,
    g: u8,
    b: u8,
    three_d: bool,
    colors: &[MapArtColorEntry],
    options: &MapArtColorOptions,
) -> (usize, i32) {
    let mut best_idx = 0usize;
    let mut best_offset = 0i32;
    let mut min_dist = f32::MAX;

    if three_d {
        let layers = [(255u8, 1i32), (220u8, 0i32), (180u8, -1i32)];
        for (brightness, offset) in layers {
            let factor = brightness as f32 / 255.0;
            for (idx, color) in colors.iter().enumerate() {
                let tr = clamp_u8(color.r as f32 * factor);
                let tg = clamp_u8(color.g as f32 * factor);
                let tb = clamp_u8(color.b as f32 * factor);
                let d = color_distance(&options.match_mode, r, g, b, tr, tg, tb);
                if d < min_dist {
                    min_dist = d;
                    best_idx = idx;
                    best_offset = offset;
                }
            }
        }
    } else {
        for (idx, color) in colors.iter().enumerate() {
            let d = color_distance(&options.match_mode, r, g, b, color.r, color.g, color.b);
            if d < min_dist {
                min_dist = d;
                best_idx = idx;
            }
        }
    }

    (best_idx, best_offset)
}

fn nearest_palette_color(
    r: u8,
    g: u8,
    b: u8,
    colors: &[MapArtColorEntry],
    options: &MapArtColorOptions,
) -> (u8, u8, u8) {
    let mut best = (0u8, 0u8, 0u8);
    let mut min_dist = f32::MAX;
    for color in colors {
        let d = color_distance(&options.match_mode, r, g, b, color.r, color.g, color.b);
        if d < min_dist {
            min_dist = d;
            best = (color.r, color.g, color.b);
        }
    }
    best
}

fn compute_edge_strength(buffer: &[u8], x: usize, y: usize, width: usize, height: usize) -> f32 {
    let idx = (y * width + x) * 4;
    let r = buffer[idx] as f32;
    let g = buffer[idx + 1] as f32;
    let b = buffer[idx + 2] as f32;

    let mut total = 0.0f32;
    let mut count = 0.0f32;
    let neighbors = [
        (x.wrapping_add(1), y, x + 1 < width),
        (x, y.wrapping_add(1), y + 1 < height),
        (x.wrapping_sub(1), y, x > 0),
        (x, y.wrapping_sub(1), y > 0),
    ];

    for (nx, ny, valid) in neighbors {
        if !valid {
            continue;
        }
        let n_idx = (ny * width + nx) * 4;
        total += (r - buffer[n_idx] as f32).abs();
        total += (g - buffer[n_idx + 1] as f32).abs();
        total += (b - buffer[n_idx + 2] as f32).abs();
        count += 1.0;
    }

    if count <= 0.0 {
        return 1.0;
    }

    let normalized = total / (count * 255.0 * 3.0);
    (normalized * 2.0).clamp(0.0, 1.0)
}

fn diffuse_error(
    buffer: &mut [u8],
    x: i32,
    y: i32,
    width: usize,
    height: usize,
    err_r: f32,
    err_g: f32,
    err_b: f32,
    factor: f32,
    adaptive_scale: f32,
) {
    if x < 0 || y < 0 {
        return;
    }
    let ux = x as usize;
    let uy = y as usize;
    if ux >= width || uy >= height {
        return;
    }

    let idx = (uy * width + ux) * 4;
    let f = factor * adaptive_scale;
    buffer[idx] = clamp_u8(buffer[idx] as f32 + err_r * f);
    buffer[idx + 1] = clamp_u8(buffer[idx + 1] as f32 + err_g * f);
    buffer[idx + 2] = clamp_u8(buffer[idx + 2] as f32 + err_b * f);
}

fn preprocess_pixels_with_dither(
    mut pixels: Vec<u8>,
    width: usize,
    height: usize,
    use_dithering: bool,
    dither_mode: &str,
    adaptive_threshold: f32,
    color_table: &[MapArtColorEntry],
    color_options: &MapArtColorOptions,
) -> Vec<u8> {
    let mode = dither_mode.to_ascii_lowercase();
    let adaptive = adaptive_threshold.clamp(0.0, 1.0);
    let bayer4x4: [f32; 16] = [
        0.0, 8.0, 2.0, 10.0,
        12.0, 4.0, 14.0, 6.0,
        3.0, 11.0, 1.0, 9.0,
        15.0, 7.0, 13.0, 5.0,
    ];

    for y in 0..height {
        for x in 0..width {
            let idx = (y * width + x) * 4;
            if pixels[idx + 3] == 0 {
                continue;
            }

            let old_r = pixels[idx];
            let old_g = pixels[idx + 1];
            let old_b = pixels[idx + 2];
            let (adj_r, adj_g, adj_b) = adjust_color(old_r, old_g, old_b, color_options);

            if !use_dithering || mode == "none" {
                pixels[idx] = adj_r;
                pixels[idx + 1] = adj_g;
                pixels[idx + 2] = adj_b;
                continue;
            }

            if mode == "ordered" {
                let threshold = bayer4x4[(y % 4) * 4 + (x % 4)] / 16.0 - 0.5;
                let edge = compute_edge_strength(&pixels, x, y, width, height);
                let amp = 24.0 * (1.0 - adaptive * (1.0 - edge));
                let sr = clamp_u8(adj_r as f32 + threshold * amp);
                let sg = clamp_u8(adj_g as f32 + threshold * amp);
                let sb = clamp_u8(adj_b as f32 + threshold * amp);
                let (nr, ng, nb) = nearest_palette_color(sr, sg, sb, color_table, color_options);
                pixels[idx] = nr;
                pixels[idx + 1] = ng;
                pixels[idx + 2] = nb;
                continue;
            }

            let (nr, ng, nb) = nearest_palette_color(adj_r, adj_g, adj_b, color_table, color_options);
            pixels[idx] = nr;
            pixels[idx + 1] = ng;
            pixels[idx + 2] = nb;

            let err_r = adj_r as f32 - nr as f32;
            let err_g = adj_g as f32 - ng as f32;
            let err_b = adj_b as f32 - nb as f32;
            let edge = compute_edge_strength(&pixels, x, y, width, height);
            let adaptive_scale = (1.0 - adaptive * (1.0 - edge) * 0.8).max(0.2);

            if mode == "atkinson" {
                diffuse_error(&mut pixels, x as i32 + 1, y as i32, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32 + 2, y as i32, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32 - 1, y as i32 + 1, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32, y as i32 + 1, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32 + 1, y as i32 + 1, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32, y as i32 + 2, width, height, err_r, err_g, err_b, 1.0 / 8.0, adaptive_scale);
            } else {
                diffuse_error(&mut pixels, x as i32 + 1, y as i32, width, height, err_r, err_g, err_b, 7.0 / 16.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32 - 1, y as i32 + 1, width, height, err_r, err_g, err_b, 3.0 / 16.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32, y as i32 + 1, width, height, err_r, err_g, err_b, 5.0 / 16.0, adaptive_scale);
                diffuse_error(&mut pixels, x as i32 + 1, y as i32 + 1, width, height, err_r, err_g, err_b, 1.0 / 16.0, adaptive_scale);
            }
        }
    }

    pixels
}

async fn save_map_art(
    blocks: Vec<BlockStatePos>,
    file_name: String,
    size: Size,
    schematic_type: i64,
    sub_version: i64,
    je_blocks: State<'_, BlocksData>,
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    async move {
        let now = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
        let mut conn = db.0.get()?;
        let block_data = BlockStatePosList {
            elements: VecDeque::from(blocks),
        };
        let data = SchematicData::new(block_data, TileEntitiesList::default(), EntitiesList::default(), size);
        match schematic_type {
            1 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToCreateSchematic::new(&data)?.create_schematic(true);
                let schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 1,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            2 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToLmSchematic::new(&data)?.lm_schematic(6);
                let schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 2,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 6,
                };
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            3 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToWeSchematic::new(&data)?.we_schematic(sub_version as i32)?;
                let schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 3,
                    sub_type: sub_version as i32,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                    true,
                )?;
            }
            4 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToBgSchematic::new(&data)?.bg_schematic(sub_version as i32)?;
                let schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 4,
                    sub_type: sub_version as i32,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_json_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                )?;
            }
            5 => {
                let requirement = get_requirements(&data.blocks)?;
                let requirements_str = RequirementStr::from_requirements(&requirement, &je_blocks)
                    .export_to_string()?;
                let unique_blocks = get_unique_block_str(&data.blocks)?;
                let data = ToBESchematic::new(&data)?.to_be_value();
                let schematic = Schematic {
                    id: 0,
                    name: format!("map_art_{}", file_name),
                    description: "".parse()?,
                    schematic_type: 5,
                    sub_type: -1,
                    is_deleted: false,
                    sizes: size.to_string(),
                    user: "your".parse()?,
                    is_upload: false,
                    version: 0,
                    version_list: "0".parse()?,
                    created_at: "".parse()?,
                    schematic_tags: "".to_string(),
                    classification: "".to_string(),
                    updated_at: now.clone(),
                    game_version: "".parse()?,
                    lm_version: 0,
                };
                let new_id = new_schematic(&mut conn, schematic.clone())?;
                new_schematic_data(
                    &mut conn,
                    new_id,
                    requirements_str.clone(),
                    unique_blocks.clone(),
                )?;
                add_user_schematic(&mut conn, 1)?;
                let schematic_str = serde_json::to_string(&schematic)?;
                new_history(
                    &mut conn,
                    new_id,
                    schematic_str,
                    requirements_str,
                    unique_blocks,
                )?;
                file_manager.save_nbt_le_value(
                    new_id,
                    data,
                    0,
                    sub_version as i32,
                    schematic_type as i32,
                )?;
            }
            _ => {
                anyhow::bail!("unknown schematic type: {}", schematic_type);
            }
        }
        Ok(true)
    }
    .await
    .map_err(|e: anyhow::Error| e.to_string())
}

#[tauri::command]
pub async fn create_map_art(
    blocks: Vec<BlockStatePos>,
    file_name: String,
    size: Size,
    schematic_type: i64,
    sub_version: i64,
    je_blocks: State<'_, BlocksData>,
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    save_map_art(
        blocks,
        file_name,
        size,
        schematic_type,
        sub_version,
        je_blocks,
        db,
        file_manager,
    ).await
}

#[tauri::command]
pub async fn create_map_art_from_pixels(
    pixels: Vec<u8>,
    width: i32,
    height: i32,
    file_name: String,
    schematic_type: i64,
    sub_version: i64,
    use_dithering: bool,
    replace_air: bool,
    three_d: bool,
    create_max_z: i32,
    axios: String,
    color_table: Vec<MapArtColorEntry>,
    color_options: MapArtColorOptions,
    dither_mode: String,
    adaptive_threshold: f32,
    je_blocks: State<'_, BlocksData>,
    db: State<'_, DatabaseState>,
    file_manager: State<'_, FileManager>,
) -> Result<bool, String> {
    if width <= 0 || height <= 0 {
        return Err("invalid image size".to_string());
    }
    if color_table.is_empty() {
        return Err("empty color table".to_string());
    }

    let expected = (width as usize) * (height as usize) * 4;
    if pixels.len() < expected {
        return Err("invalid rgba buffer length".to_string());
    }

    let processed_pixels = preprocess_pixels_with_dither(
        pixels,
        width as usize,
        height as usize,
        use_dithering,
        &dither_mode,
        adaptive_threshold,
        &color_table,
        &color_options,
    );

    let axis = axios.to_ascii_lowercase();
    let mut blocks: Vec<BlockStatePos> = Vec::with_capacity((width as usize) * (height as usize));
    let mut min_z = i32::MAX;
    let mut max_z = i32::MIN;
    let mut last_z = 0i32;
    let air_block = build_block("air");

    let mut block_cache: std::collections::HashMap<String, Arc<crate::utils::block_state_pos_list::BlockData>> = std::collections::HashMap::new();
    for entry in &color_table {
        if !block_cache.contains_key(&entry.block_id) {
            block_cache.insert(entry.block_id.clone(), build_block(&entry.block_id));
        }
    }

    for raw_x in 0..width {
        for raw_y in 0..height {
            if raw_y == 0 {
                last_z = 0;
            }

            let i = (raw_y * width + raw_x) as usize;
            let idx = i * 4;
            let alpha = processed_pixels[idx + 3];

            let image_x = raw_x;
            let image_y = if axis == "x" || axis == "z" {
                height - raw_y - 1
            } else {
                raw_y
            };

            let (x3d, y3d, z3d) = match axis.as_str() {
                "x" => (0, image_y, image_x),
                "y" => (image_x, 0, image_y),
                "z" => (image_x, image_y, 0),
                _ => (image_x, 0, image_y),
            };

            if alpha == 0 && replace_air {
                let pos = match axis.as_str() {
                    "x" => crate::utils::block_state_pos_list::BlockPos { x: last_z, y: y3d, z: z3d },
                    "y" => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: last_z, z: z3d },
                    "z" => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: y3d, z: last_z },
                    _ => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: last_z, z: z3d },
                };
                blocks.push(BlockStatePos { pos, block: air_block.clone() });
                continue;
            }

            let r = processed_pixels[idx];
            let g = processed_pixels[idx + 1];
            let b = processed_pixels[idx + 2];
            let (color_idx, z_offset) = nearest_block(r, g, b, three_d, &color_table, &color_options);
            let selected = &color_table[color_idx];

            last_z += z_offset;
            if three_d {
                if last_z >= create_max_z || last_z <= -create_max_z {
                    last_z = 0;
                }
            }
            min_z = min_z.min(last_z);
            max_z = max_z.max(last_z);

            let block = block_cache
                .get(&selected.block_id)
                .cloned()
                .unwrap_or_else(|| build_block(&selected.block_id));

            let pos = match axis.as_str() {
                "x" => crate::utils::block_state_pos_list::BlockPos { x: last_z, y: y3d, z: z3d },
                "y" => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: last_z, z: z3d },
                "z" => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: y3d, z: last_z },
                _ => crate::utils::block_state_pos_list::BlockPos { x: x3d, y: last_z, z: z3d },
            };
            blocks.push(BlockStatePos { pos, block });
        }
    }

    let depth = if min_z == i32::MAX || max_z == i32::MIN {
        1
    } else {
        max_z - min_z + 1
    };

    let size = if axis == "x" {
        Size { width: depth, height, length: width }
    } else if axis == "y" {
        Size { width, height: depth, length: height }
    } else {
        Size { width, height, length: depth }
    };

    save_map_art(
        blocks,
        file_name,
        size,
        schematic_type,
        sub_version,
        je_blocks,
        db,
        file_manager,
    ).await
}
