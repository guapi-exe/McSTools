// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs::File;
use crate::building_gadges::bg_schematic::BgSchematic;
use crate::be_schematic::be_schematic::BESchematic;
use crate::be_schematic::to_be_schematic::ToBESchematic;
use crate::create::create_schematic::CreateSchematic;
use crate::create::to_create_schematic::ToCreateSchematic;
use crate::litematica::lm_schematic::LmSchematic;
use crate::litematica::to_lm_schematic::ToLmSchematic;
use crate::utils::schematic_data::SchematicError;
use crate::word_edit::we_schematic::WeSchematic;
use std::{sync::{Arc, atomic::{AtomicU64, Ordering}}, thread, time::Duration};
use std::time::Instant;
use sysinfo::{Pid, ProcessesToUpdate, System};
use utils::extend_write::to_writer_gzip;
use utils::requirements::get_requirements;
use crate::be_schematic::le_reader::write_nbt_le::save_nbt_le;

pub mod building_gadges;
pub mod create;
pub mod be_schematic;
pub mod litematica;
pub mod utils;
pub mod word_edit;
fn main() {
    rust_lib::run()
}
#[test]
fn test_be_schematic() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let schematic2 =
        BESchematic::new("./schematic/test.mcstructure")?;
    let schem2 = schematic2.get_blocks_pos()?;
    //print!("{:?}", schem2);
    let to = ToBESchematic::new(&schem2)?;
    println!("{:?},{:?}", to.start_pos, to.end_pos);
    let requirements = get_requirements(&schem2.blocks)?;
    //print!("{:?}", requirements);

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}
#[test]
fn test_lm_schematic() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let schematic2 =
        LmSchematic::new("./schematic/08baa20e-264d-41d4-8205-4611029936b0.litematic")?;
    let schem2 = schematic2.get_blocks_pos()?;
    let to = ToLmSchematic::new(&schem2)?;
    println!("{:?},{:?}", to.start_pos, to.end_pos);
    let requirements = get_requirements(&schem2.blocks)?;
    //print!("{:?}", requirements);

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}
#[test]
fn test_create_schematic() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let sichematic = CreateSchematic::new("./schematic/test.nbt")?;
    let schem = sichematic.get_blocks_pos()?;
    //print!("{:?}", schem);

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}
#[test]
fn bg_schematic_write() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let mut schematic3 =
        BgSchematic::new("./schematic/384046fd-ac85-4d97-bfca-0d2d41482cab_type1.json")?;
    let schem3 = schematic3.get_blocks_pos()?;

    //let bg = ToBgSchematic::new(&schem3);
    //let data = bg.bg_schematic()?;
    //let output_path = "./schematic/out.json";
    //let file = File::create(output_path)?;
    //let writer = BufWriter::new(file);

    //serde_json::to_writer_pretty(writer, &data)?;

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}
#[test]
fn lm_schematic_write() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let mut schematic3 =
        WeSchematic::new("./schematic/3914ec1f-f457-428e-994f-957182d2c8c2.schem")?;
    let schem3 = schematic3.get_blocks_pos()?;

    let bg = ToLmSchematic::new(&schem3)?;
    let data = bg.lm_schematic(6);
    let output_path = "./schematic/out2.litematic";
    to_writer_gzip(&data, output_path)?;

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}
#[test]
fn lm_big_schematic_write() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let mut schematic3 =
        LmSchematic::new("./schematic/36fbf6f4-5f07-4370-b4c5-cefdb12c4b92.litematic")?;
    let schem3 = schematic3.get_blocks_pos()?;

    println!("加载方块: {}", schem3.blocks.elements.len());
    //let bg = ToCreateSchematic::new(&schem3)?;
    //let bg = ToCreateSchematic::new(&schem3)?;
    //let data = bg.create_schematic(false);
    //let output_path = "./schematic/out.nbt";
    //to_writer_gzip(&data, output_path)?;

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);

    Ok(())
}
#[test]
fn be_schematic_write() -> Result<(), SchematicError> {
    let peak_watcher = start_memory_peak_watcher();
    let start_time = Instant::now();

    let schematic2 =
        BESchematic::new("./schematic/out6.mcstructure")?;
    let schem2 = schematic2.get_blocks_pos()?;
    //print!("{:?}", schem2);
    let to = ToBESchematic::new(&schem2)?;
    println!("{:?},{:?},{:?}", to.height, to.length, to.width);
    //let requirements = get_requirements(&schem2.blocks)?;
    //print!("{:?}", requirements);
    let root = to.to_be_value();
    let output_path = "./schematic/out8.mcstructure";
    let file = File::create(output_path)?;
    save_nbt_le(file, "Schematic", &root)?;

    let duration = start_time.elapsed();
    let peak_mem_kb = peak_watcher.load(Ordering::Relaxed) / 1024;
    println!("执行时间: {:.2} 秒", duration.as_secs_f64());
    println!("内存峰值: {} MB", peak_mem_kb / 1024);
    Ok(())
}


fn start_memory_peak_watcher() -> Arc<AtomicU64> {
    let peak = Arc::new(AtomicU64::new(0));
    let peak_clone = Arc::clone(&peak);

    thread::spawn(move || {
        let pid = Pid::from(std::process::id() as usize);
        let mut sys = System::new_all();

        loop {
            sys.refresh_processes(ProcessesToUpdate::All, false);
            if let Some(proc) = sys.process(pid) {
                let mem = proc.memory();
                peak_clone.fetch_max(mem, Ordering::Relaxed);
            }
            thread::sleep(Duration::from_millis(50)); // 采样间隔
        }
    });

    peak
}