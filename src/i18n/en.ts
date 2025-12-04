export default {
  mapImage2d: {
    fileName: 'File Name',
    resolution: 'Resolution',
    selectImageFile: 'Select Image File',
    uploadImageTip: 'Please upload the source image first',
    exportWidth: 'Export Width',
    exportHeight: 'Export Height',
    suggestSameRatio: 'Recommended to keep the same ratio as the original size',
    enableDithering: 'Enable Dithering',
    ditheringHint: 'Improve detail with color dithering',
    ditheringTooltip: 'Use Floyd-Steinberg algorithm for error diffusion and color transition',
    airBlock: 'Air Block',
    airBlockHint: 'Replace transparent SRGBA with air block',
    airBlockTooltip: 'Reduce workload and change style',
    refresh: 'Refresh',
    exportSchematic: 'Export Schematic',
    exportImage: 'Export Image',
    blockSelector: 'Block Selector',
    processingImage: 'Processing image...',
    waitingForImage: 'Waiting for input image...',
    exportToType: 'Export to specified schematic type.',
    mainType: 'Main Type',
    subType: 'Sub Type',
    axisOrientation: 'Axis Orientation',
    max3dHeight: 'Max 3D Height',
    cancel: 'Cancel',
    confirmExport: 'Confirm Export'
  },
  redStoneMusic: {
    unimplemented: 'Not implemented.'
  },
  localData: {
    clickToExpandFilter: 'Click to expand filter',
    keywordFilter: 'Keyword Filter',
    inputBlueprintNameOrDesc: 'Enter blueprint name or description',
    allBlueprints: 'All Blueprints',
    createCategory: 'Create Category',
    createNewCategory: 'Create New Category',
    tagName: 'Tag Name',
    cancel: 'Cancel',
    create: 'Create',
    confirmDelete: 'Confirm Delete',
    confirmDeleteBlueprint: 'Are you sure to permanently delete blueprint',
    confirmDeleteCategory: 'Are you sure to delete category',
    thisActionCannotBeUndone: 'This action cannot be undone!',
    exitMultiSelect: 'Exit Multi-select',
    multiSelect: 'Multi-select',
    batchExport: 'Batch Export',
    selectAll: 'Select All',
    clearAll: 'Clear All',
    unparsed: 'Unparsed',
    currentVersion: 'Current Version',
    export: 'Export',
    loadingMore: 'Loading more data...',
    noMoreData: 'No more data.'
  },
  webData: {
    clickToExpandFilter: 'Click to expand filter',
    keywordFilter: 'Keyword Filter',
    inputBlueprintNameOrDesc: 'Enter blueprint name or description',
    blueprintType: 'Blueprint Type',
    sortType: 'Sort Type',
    import: 'Import',
    goTo: 'Go',
    loadingMore: 'Loading more data...',
    noMoreData: 'No more data.',
    unparsed: 'Unparsed'
  },
  toolsData: {
    loading: 'Loading structure...',
    tooLarge: 'The schematic is too large (size: {size}). Are you sure to load? Loading may consume a lot of memory or even crash.',
    confirmLoad: 'Confirm Load',
    confirmSave: 'Confirm Save',
    noEditForType4: 'Editing is not supported for this schematic type. Please edit the JSON manually!',
    saveWarning: 'Are you sure to save changes? No validation will be performed. Please confirm yourself!',
    cancel: 'Cancel',
    confirmSaveChange: 'Confirm Save Changes',
    loadFailed: 'Failed to load source data: {error}',
    saveSuccess: 'Data saved successfully',
    saveError: 'An error occurred: {error}'
  },
  toolsConvert: {
    longTimeTip: 'Converting large schematics may take a long time, please be patient',
    extType: 'Extension Type',
    originSize: 'Original Size',
    version: 'Version',
    subVersion: 'Sub Version',
    weSubVersion0: '0: WE Latest Format',
    weSubVersion1: '1: WE 1.16-',
    bgSubVersion0: '0: Builder Helper Latest',
    bgSubVersion1: '1: Builder Helper 1.16+',
    bgSubVersion2: '2: Builder Helper 1.12+',
    oneClick: 'One-click Convert',
    convertSuccess: 'Conversion complete, reload to export',
    error: 'An error occurred: {error}',
    gzipCompression: 'Gzip Compression',
    unknownTitle: 'Unknown Format',
    unknownDesc: 'Unknown format description',
    desc: 'Format Description',
    fileInfo: 'File Info',
    fileInfoDesc: 'Select the schematic file to convert. Supports .litematic, .schematic, .mcstructure',
    selectFile: 'Select File',
    maxSize: 'Max 100MB',
    litematicTitle: 'Litematic',
    litematicDesc: 'Compatible with Minecraft Litematic format',
    availableSubVersion: 'Available Sub Versions',
    exist: 'Exists',
    existSubVersion: 'There are sub versions available',
    convertToThis: 'Convert to this format',
    createTitle: 'Vanilla Structure',
    createDesc: 'Compatible with JE Vanilla Structure Block and Create',
    weTitle: 'WorldEdit',
    weDesc: 'Compatible with WorldEdit 1.16+ and latest axiom',
    bgTitle: 'Builder Helper',
    bgDesc: 'Compatible with Builder Helper 1.12+ and 3 variant formats',
    beTitle: 'MC BE',
    beDesc: 'Compatible with Minecraft BE 1.18+ Structure Block format',
    toLitematic: 'Convert to Litematic',
    toCreate: 'Convert to Vanilla',
    toWE: 'Convert to WorldEdit',
    toBG: 'Convert to Builder Helper',
    toBE: 'Convert to MC BE',
    selectSubVersion: 'Select Sub Version',
    selectSubVersionTip: 'Please select the sub version to convert to.',
    cancel: 'Cancel',
    confirm: 'Confirm',
    startConfirm: 'Start Confirm',
    exportConfirm: 'Export Confirm',
    diffRequirements: 'Requirements Diff',
    convertToTargetVersion: 'Convert to Target Version',
    hasSubVersion: 'There are sub versions available'
  },
  toolsReplace: {
    idRequired: 'Block ID is required',
    idFormat: 'Format: namespace:block_name',
    propFormat: 'Each line should be key=value',
    invalidIdFormat: 'Invalid block ID format',
    loadBlockError: 'Failed to load block data',
    quantityGreaterThanZero: 'Replace quantity must be greater than 0',
    selectBlockAndTarget: 'Please select the block and target to replace',
    selectBlockAndTargetDetails: 'Please select the block and target (details mode)',
    replaceSuccess: 'Block replacement completed, check in repository',
    replaceFailed: 'Replacement operation failed',
    error: 'An error occurred: {error}',
    briefMode: 'Brief Mode',
    detailsMode: 'Details Mode',
    searchBlock: 'Search Block',
    id: 'ID',
    replaceTo: 'Replace to (input ID or select)',
    customId: 'Custom ID',
    replaceQuantity: 'Replace Quantity',
    globalReplaceLocked: 'Global replace locked: {block} quantity {num}',
    selectBlockFirst: 'Please select the block to replace',
    globalReplace: 'Global Replace',
    addToList: 'Add to List',
    executeReplace: 'Execute Replace',
    searchBlockWithProps: 'Search Block (with property filter)',
    blockIdLabel: 'Block ID (e.g. minecraft:stone)',
    blockIdPlaceholder: 'namespace:block_name',
    blockPropsLabel: 'Block Properties',
    blockPropsPlaceholder: 'One property per line, format: key=value',
    blockPropsTooltip: 'Enter one property per line, e.g. color=blue',
    preview: 'Preview',
    props: 'Properties',
    noRules: 'No replacement rules',
    mode: 'Mode',
    originalBlock: 'Original Block',
    newBlock: 'New Block',
    quantity: 'Quantity',
    action: 'Action',
    defaultGlobal: 'Default Global',
    delete: 'Delete',
    confirmReplace: 'Confirm Replacement',
    replaceExportHint: 'Replacement will be exported as a new schematic',
    replacePreview: 'About to replace {count} block rules',
    cancel: 'Cancel',
    confirmExecute: 'Confirm Execute'
  },
  toolsSchematic: {
    basicInfo: 'Schematic Basic Info',
    id: 'ID',
    name: 'Name',
    type: 'Type',
    size: 'Size',
    lmVersion: 'Projection Format Version',
    status: 'Status',
    deleted: 'Deleted',
    normal: 'Normal',
    creator: 'Creator',
    unknown: 'Unknown',
    version: 'Version',
    updatedAt: 'Updated At',
    tags: 'Schematic Tags',
    tagsHint: 'Press Enter to add tag',
    description: 'Schematic Description',
    updateFile: 'Update Schematic File',
    uploadSuccess: 'Successfully uploaded {count} files',
    uploadError: 'Error occurred',
    noSchematic: 'No schematic selected',
    editLmVersion: 'Edit Projection Version',
    editLmVersionHint: 'Edit building projection, version controller',
    targetVersion: 'Target Output Version',
    confirmTargetVersion: 'Confirm your target version before editing',
    cancel: 'Cancel',
    confirmEdit: 'Confirm Edit'
  },
  toolsSplit: {
    splitMethod: 'Split Method',
    verticalSplit: 'Vertical Split',
    horizontalSplit: 'Horizontal Area',
    gridSplit: 'Grid Division',
    lengthX: 'Length (X)',
    widthY: 'Width (Y)',
    xz: 'X×Z',
    error: 'An error occurred: {error}',
    splitAlert: 'Do not switch schematic or close the page during splitting. Downloaded files are temporary.',
    splitCount: 'Split Count',
    originalSize: 'Original Size',
    cannotSplit: 'is insufficient, cannot split into {count} parts',
    executeSplit: 'Execute Split',
    splitSize: 'Split Size',
    splitResult: 'Split Result',
    downloadAll: 'Download All',
    file: 'files',
    download: 'Download',
    splitResultHint: 'Results will be shown here after splitting',
    splitButtonHint: 'Click "Execute Split" on the left to generate split files',
    airFrame: 'Air Frame',
    airFrameHint: 'Add air frame to split schematics',
    airFrameTooltip: 'Add air frame to prevent size inconsistency after splitting'
  },
  toolsStats: {
    total: 'Total',
    material: 'materials',
    exportCsv: 'Export CSV',
    list: 'List',
    chart: 'Chart',
    materialName: 'Material Name',
    count: 'Count',
    percentage: 'Percentage',
    noMaterialData: 'No material data',
    noChartData: 'No data available for chart'
  },
  toolsThreeD: {
    largeSizeSingleLayer: 'Schematic is too large, single layer view enabled by default',
    error: 'An error occurred: {error}',
    currentLayer: 'Current Layer',
    singleLayer: 'Single Layer',
    singleLayerHint: 'Show only the selected layer',
    loadingStructure: 'Loading structure...',
    confirmLargeLoad: 'This schematic is very large (size: {size}). Are you sure you want to load it? Loading may consume a lot of memory and even cause a crash.',
    confirmLoad: 'Confirm Load',
    hideMaterialList: 'Hide Material List',
    showMaterialList: 'Show Material List',
    freeView: 'Free View',
    frontView: 'Front View',
    sideView: 'Side View',
    topView: 'Top View',
    exportView: 'Export View',
    viewsNotReady: 'Views are not ready yet',
    exportSuccess: 'Export successful',
    exportError: 'Export failed: {error}',
    annotation: 'Annotation',
    blockId: 'ID',
    blockCoord: 'Coordinates',
    blockProperties: 'Properties',
    containerItems: 'Container Items',
    size: 'Size',
    author: 'Author',
    version: 'Version'
  },
  common: {
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    search: 'Search',
    loading: 'Loading...',
    success: 'Success',
    error: 'Error',
    confirm: 'Confirm',
    back: 'Back'
  },
  menu: {
    home: 'Home',
    settings: 'Settings',
    about: 'About'
  },
  home: {
    title: 'Schematic Toolbox',
    stats: {
      localSchematics: 'Local Schematics',
      cloudSchematics: 'Cloud Schematics',
      welcome: 'Welcome Back'
    },
    upload: {
      title: 'Schematic Processing',
      dragDrop: 'Drag and drop files or click to upload',
      supportedFormats: 'Supported formats: nbt, litematic, schem, json, mcstruct (max 50MB). Multiple files allowed',
      selectFile: 'Select File',
      uploadSuccess: 'Successfully uploaded {count} file(s)',
      uploadError: 'Error occurred: {error}'
    },
    supportedTypes: {
      title: 'Supported Schematic Types',
      vanilla: {
        title: 'Vanilla Structure',
        desc: 'Minecraft vanilla supported schematic format, also used by Create mod'
      },
      buildingGadgets: {
        title: 'Building Gadgets',
        desc: 'Most common building assistant tool in tech modpacks'
      },
      litematica: {
        title: 'Litematica',
        desc: 'Essential tool for technical Minecraft players'
      },
      worldEdit: {
        title: 'WorldEdit',
        desc: 'Classic building tool, still in use today, also adopted by newer tools like Axiom'
      },
      bedrock: {
        title: 'MC BE',
        desc: 'Minecraft Bedrock Edition schematic format, currently not fully supported'
      }
    }
  },
  settings: {
    darkMode: 'Dark Mode',
    lightMode: 'Light Mode',
    title: 'Settings',
    update: {
      title: 'Update Settings',
      autoUpdate: 'Enable Auto Update',
      source: 'Update Source',
      sourcePlaceholder: 'Select or enter update source',
      sourceNoData: 'Enter a valid HTTP address'
    },
    debug: {
      title: 'Debug Mode',
      enable: 'Enable Debug Mode',
      open: 'Open Debug',
      openDev: 'Open Debug DEV'
    },
    theme: {
      title: 'Theme Follow',
      autoTheme: 'Enable System Theme Follow (Page theme will follow Windows theme changes)'
    },
    resources: {
      title: 'Resource Files',
      clear: 'Clear Resource Files (This will delete all resource files and your stored schematics)',
      clearConfirm: 'Confirm Clear',
      clearWarning: 'Clearing will cause all data to be lost, please backup first',
      openFolder: 'Open Resource Folder',
      openFolderBtn: 'Open Directory'
    },
    language: {
      title: 'Language Settings',
      select: 'Language Selection'
    }
  },
  messages: {
    clearSuccess: 'Resource files cleared, will restart in 5 seconds',
    error: 'An error occurred: {error}',
    fetchError: 'Failed to fetch schematic: {error}'
  },
  tools: {
    title: 'Schematic Editor',
    upload: 'Upload Schematic',
    noSchematic: 'No Schematic Selected',
    schematicId: 'Schematic ID: {id}',
    tabs: {
      schematic: 'Schematic Details',
      history: 'Version Control',
      split: 'Split Schematic',
      replace: 'Block Replacement',
      convert: 'Schematic Conversion',
      data: 'Source Data View',
      stats: 'Material Statistics',
      threeD: '3D Preview'
    },
    convert: {
      title: 'Schematic Conversion',
      tip: 'Large schematic conversion may take some time, please be patient',
      oneClickConvert: 'One-Click Convert',
      convertToFormat: 'Convert to Format',
      confirmStart: 'Confirm Start',
      confirmExport: 'Confirm Export',
      cancel: 'Cancel',
      targetVersion: 'Target Output Version',
      waitingTip: 'Large schematic conversion requires some waiting time',
      noParams: 'No conversion parameters, large schematic conversion requires some waiting time',
      alreadyExists: 'Already Exists',
      formats: {
        vanilla: {
          title: 'Vanilla Structure',
          desc: 'Compatible with Minecraft vanilla structure block format',
          ext: 'nbt'
        },
        litematica: {
          title: 'Litematica',
          desc: 'Compatible with Minecraft Litematica schematic format',
          ext: 'litematic'
        },
        worldEdit: {
          title: 'WorldEdit',
          desc: 'Compatible with WorldEdit mod 1.16+ and latest axiom',
          ext: 'schem',
          versions: {
            latest: '0: Latest WE Format',
            legacy: '1: WE 1.16-'
          }
        },
        buildingGadgets: {
          title: 'Building Gadgets',
          desc: 'Compatible with Building Gadgets 1.12+ three variant formats',
          ext: 'json',
          versions: {
            latest: '0: Latest BG Format',
            modern: '1: BG 1.16+',
            legacy: '2: BG 1.12+'
          }
        },
        bedrock: {
          title: 'MC BE',
          desc: 'Compatible with Minecraft Bedrock Edition 1.18+ structure block format',
          ext: 'mcstructure'
        }
      },
      meta: {
        extension: 'Extension',
        originalSize: 'Original Size',
        version: 'Version',
        subVersion: 'Sub Version',
        exists: 'Already Exists',
        gzipCompression: 'Gzip Compression',
        hasSubVersions: 'Has Sub Versions'
      }
    }
  },
  schematics: {
    title: 'Schematic Repository',
    local: 'Local Schematics',
    web: 'Web Schematics',
    upload: 'Upload Schematic',
    source: 'Source Site',
    sites: {
      mcs: 'MCS:www.mcschematic.top',
      cms: 'CMS:www.creativemechanicserver.com'
    }
  },
  report: {
    title: 'Issue Report',
    subtitle: 'Feedback Channels',
    tip: 'Before seeking help, try to solve the problem yourself first!',
    channels: {
      github: {
        title: 'GitHub issue',
        desc: 'Report bugs and issues through GitHub issues'
      },
      qqGroup: {
        title: 'QQ Group',
        desc: 'Join our official QQ group to report bugs and issues'
      },
      qqChannel: {
        title: 'QQ Channel',
        desc: 'Join our official QQ channel to report bugs and issues'
      }
    },
    placeholder: 'Not available yet, this is just a placeholder'
  },
  others: {
    title: 'Toolbox',
    tabs: {
      mapArt: 'Map Art',
      redstoneMusic: 'Redstone Music'
    }
  },
  individuation: {
    title: 'Personalization',
    opacity: {
      title: 'Opacity',
      value: '{value}%'
    },
    theme: {
      title: 'Theme Color',
      options: {
        grey: 'Default Grey',
        blue: 'Azure Theme',
        darkBlue: 'Dark Blue Night',
        green: 'Fresh Green',
        orange: 'Vibrant Orange',
        yellow: 'Pineapple Yellow',
        brown: 'Oak Brown',
        greyDark: 'Dark'
      }
    },
    background: {
      title: 'Background Settings',
      imageInfo: 'Image Information',
      fileName: 'File Name',
      fileSize: 'File Size',
      resolution: 'Resolution',
      layoutMode: 'Layout method',
      layoutModes: {
        stretch: 'Stretch',
        repeat: 'Tile',
        contain: 'Fit',
        cover: 'Fill'
      },
      actions: {
        clear: 'Clear Background Image',
        refresh: 'Refresh Background Image',
        select: 'Select Background Image'
      }
    },
    font: {
      title: 'Font Settings',
      fontInfo: 'Font Information',
      fileName: 'File Name',
      fileSize: 'File Size',
      actions: {
        clear: 'Clear Font',
        refresh: 'Refresh Font',
        select: 'Select Font File'
      },
      effect: {
        title: 'Font Preview',
        content1: 'English font demonstration',
        content2: 'Bold effect: English font demonstration',
        content3: 'The quick brown fox jumps over the lazy dog.',
        content4: 'Italic style shows elegance in typography.',
        content5: 'Regular: 0123456789',
        content6: 'Special styles: ① 𝟙𝟚𝟛₄₅₆ ⓺⓻⓼⓽',
      }
    },
  },
  about: {
    title: 'About',
    version: 'Version: {version}',
    actions: {
      checkUpdate: 'Check for Updates',
      changelog: 'Changelog',
      github: 'Github',
      website: 'Official Website',
      sponsor: 'Sponsor Project',
      faq: 'FAQ→'
    },
    description: {
      title: 'App Description',
      content: 'The app uses Tauri backend based on Rust and Vue frontend.\nModular design ensures app performance, Rust\'s safety design provides better performance and memory safety.'
    },
    schematicSite: {
      title: 'Schematic Site',
      description: 'A website supporting multiple schematic formats, offering both private and public modes, with online schematic preview\nProvides online schematic conversion, material statistics, and quick import of schematics from the website to local',
      visit: 'Visit Site→'
    },
    tauri: {
      title: 'Tauri 2.0',
      tooltip: 'The app is developed using Tauri 2.0',
      currentVersion: 'Current Version: {version}'
    },
    license: {
      title: 'GNU Affero General Public License',
      tooltip: 'Allows modification and distribution but requires open-sourcing modified code and retaining copyright notices, prohibits unauthorized commercial use',
      copyright: '© 2025 MCS Tools. All rights licensed under AGPL-3.0',
      viewLicense: 'View Full License'
    },
    developers: {
      title: 'Core Developers',
      tooltip: 'All developers and representatives must comply with AGPL V3 protocol, modifications and distributions must credit all developers and the license',
      author: 'Author'
    }
  }
} 