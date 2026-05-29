    export default {
    mapImage2d: {
        fileName: '檔案名稱',
        resolution: '解析度',
        selectImageFile: '選擇圖片檔案',
        uploadImageTip: '請先上傳原始圖片',
        exportWidth: '導出寬度',
        exportHeight: '導出高度',
        suggestSameRatio: '建議與原尺寸保持同比例',
        enableDithering: '啟用抖動演算法',
        ditheringHint: '透過顏色抖動提升細節表現',
        ditheringTooltip: '使用Floyd-Steinberg演算法進行誤差擴散，優化色彩過渡',
        airBlock: '空氣方塊',
        airBlockHint: '將透明SRGBA替換為空氣方塊',
        airBlockTooltip: '減少整體工作量，改變風格',
        refresh: '刷新',
        exportSchematic: '導出藍圖',
        exportImage: '導出圖片',
        blockSelector: '方塊選擇器',
        processingImage: '正在處理圖像...',
        waitingForImage: '等待輸入圖像...',
        exportToType: '導出到指定類型藍圖。',
        mainType: '主類型',
        subType: '子類型',
        axisOrientation: '法線軸朝向',
        max3dHeight: '立體最大高度',
        cancel: '取消',
        confirmExport: '確認導出'
    },
    redStoneMusic: {
        unimplemented: '未實現。'
    },
    localData: {
        clickToExpandFilter: '點擊展開篩選條件',
        keywordFilter: '關鍵詞篩選',
        inputBlueprintNameOrDesc: '輸入藍圖名稱或描述',
        allBlueprints: '全部藍圖',
        createCategory: '建立分類',
        createNewCategory: '建立新分類',
        tagName: '標籤名稱',
        cancel: '取消',
        create: '建立',
        confirmDelete: '確認刪除',
        confirmDeleteBlueprint: '確定要永久刪除藍圖',
        confirmDeleteCategory: '確定要刪除分類',
        thisActionCannotBeUndone: '此操作不可恢復！',
        exitMultiSelect: '退出多選',
        multiSelect: '多選',
        batchExport: '批量導出',
        batchDelete: '批量刪除',
        confirmBatchDeleteBlueprints: '確定要永久刪除選中的 {count} 個藍圖嗎？',
        deleteSuccess: '已刪除 {count} 個藍圖',
        deleteFailed: '刪除失敗：{error}',
        selectAll: '全選',
        clearAll: '取消全選',
        unparsed: '未解析',
        currentVersion: '當前版本',
        export: '導出',
        loadingMore: '正在載入更多資料...',
        noMoreData: '已經到底了，沒有更多資料囉~'
    },
    webData: {
        clickToExpandFilter: '點擊展開篩選條件',
        keywordFilter: '關鍵詞篩選',
        inputBlueprintNameOrDesc: '輸入藍圖名稱或描述',
        blueprintType: '藍圖類型',
        sortType: '排序方式',
        import: '導入',
        goTo: '前往',
        loadingMore: '正在載入更多資料...',
        noMoreData: '已經到底了，沒有更多資料囉~',
        unparsed: '未解析'
    },
    toolsData: {
        loading: '加載結構中...',
        tooLarge: '該藍圖體積過大，尺寸{size}，是否確認加載；加載會佔用大量內存，甚至導致崩潰',
        confirmLoad: '確認加載',
        confirmSave: '確認保存',
        noEditForType4: '建築小幫手藍圖因特殊原因暫不提供修改，需要自行打開json修改即可！',
        saveWarning: '確定要保存更改，更改不會校驗數據正確，請自行確認！',
        cancel: '取消',
        confirmSaveChange: '確認保存更改',
        loadFailed: '源數據讀取失敗:{error}',
        saveSuccess: '數據已確認保存',
        saveError: '發生了一個錯誤: {error}'
    },
    toolsHistory: {
        unparsed: '未解析',
        exportSchematic: '導出藍圖',
        diffCompare: '差異對比',
        currentRequirements: '當前材料需求',
        diffRequirements: '材料需求差異對比'
    },    
    toolsConvert: {
        longTimeTip: '大型藍圖的轉換耗時可能過長請耐心等待',
        extType: '副檔名類型',
        originSize: '原始大小',
        version: '版本',
        subVersion: '適配子版本',
        weSubVersion0: '0: WE最新格式',
        weSubVersion1: '1: WE 1.16-',
        bgSubVersion0: '0: 小幫手最新格式',
        bgSubVersion1: '1: 小幫手1.16+',
        bgSubVersion2: '2: 小幫手1.12+',
        oneClick: '一鍵轉換',
        desc: '格式描述',
        gzipCompression: 'Gzip壓縮',
        fileInfo: '檔案資訊',
        fileInfoDesc: '請選擇要轉換的藍圖檔案，支援.litematic、.schematic、.mcstructure',
        selectFile: '選擇檔案',
        maxSize: '最大支援100MB',
        litematicTitle: '投影藍圖',
        litematicDesc: '適配Minecraft建築投影藍圖格式',
        availableSubVersion: '可用子版本',
        exist: '已存在',
        existSubVersion: '存在子版本',
        convertToThis: '轉換到該格式',
        createTitle: '香草結構',
        createDesc: '適配JE原版結構方塊與Create',
        weTitle: '創世神',
        weDesc: '適配新版1.16+創世神模組與最新版axiom',
        bgTitle: '建築小幫手',
        bgDesc: '適配1.12+建築小幫手三種變種格式藍圖',
        beTitle: 'MC BE',
        beDesc: '適配1.18+我的世界BE原版結構方塊格式',
        toLitematic: '轉換為投影藍圖',
        toCreate: '轉換為香草結構',
        toWE: '轉換為創世神',
        toBG: '轉換為建築小幫手',
        toBE: '轉換為MC BE',
        selectSubVersion: '選擇子版本',
        selectSubVersionTip: '請選擇要轉換到的子版本。',
        cancel: '取消',
        confirm: '確定',
        startConfirm: '確認開始',
        exportConfirm: '確認匯出',
        convertSuccess: '轉換完成，重新載入即可匯出',
        error: '發生了一個錯誤:{error}',
        unknownTitle: '未知格式',
        unknownDesc: '未知格式描述',
        convertToTargetVersion: '轉換到目標版本',
        hasSubVersion: '存在子版本'
    },
    toolsReplace: {
        idRequired: '必須輸入方塊ID',
        idFormat: '格式: 命名空間:方塊名',
        propFormat: '每行格式應為 鍵=值',
        invalidIdFormat: '無效的方塊ID格式',
        loadBlockError: '無法加載方塊資料',
        quantityGreaterThanZero: '替換數量必須大於0',
        selectBlockAndTarget: '請先選擇要替換的方塊和替換目標',
        selectBlockAndTargetDetails: '請先選擇要替換的方塊和替換目標（精確模式）',
        replaceSuccess: '方塊替換完成，請前往倉庫中查看',
        replaceFailed: '替換操作失敗',
        error: '發生了一個錯誤:{error}',
        briefMode: '簡單模式',
        detailsMode: '精確模式',
        searchBlock: '查找方塊',
        id: 'ID',
        replaceTo: '替換為（可輸入ID或選擇）',
        customId: '自定義ID',
        replaceQuantity: '替換數量',
        globalReplaceLocked: '全域替換已鎖定: {block} 的需求量 {num}',
        selectBlockFirst: '請先選擇要替換的方塊',
        globalReplace: '全域替換',
        addToList: '加入列表',
        executeReplace: '執行替換',
        searchBlockWithProps: '查找方塊（支援屬性過濾）',
        blockIdLabel: '方塊ID (例: minecraft:stone)',
        blockIdPlaceholder: '命名空間:方塊名',
        blockPropsLabel: '方塊屬性',
        blockPropsPlaceholder: '每行一個屬性，格式：鍵=值',
        blockPropsTooltip: '每行輸入一個屬性，例如：color=blue',
        preview: '即時預覽',
        props: '屬性',
        noRules: '暫無替換規則',
        mode: '模式',
        originalBlock: '原方塊',
        newBlock: '新方塊',
        quantity: '數量',
        action: '操作',
        defaultGlobal: '預設全域',
        delete: '刪除',
        confirmReplace: '確認替換操作',
        replaceExportHint: '替換將匯出為新藍圖',
        replacePreview: '即將替換 {count} 條方塊規則',
        cancel: '取消',
        confirmExecute: '確認執行'
    },
    toolsSchematic: {
        basicInfo: '藍圖基本資訊',
        id: 'ID',
        name: '名稱',
        type: '類型',
        size: '尺寸',
        lmVersion: '投影格式版本',
        status: '狀態',
        deleted: '已刪除',
        normal: '正常',
        creator: '創建者',
        unknown: '未知',
        version: '版本',
        updatedAt: '更新時間',
        tags: '藍圖標籤',
        tagsHint: '輸入後按Enter新增標籤',
        description: '藍圖描述',
        updateFile: '更新藍圖檔案',
        uploadSuccess: '成功上傳 {count} 個檔案',
        uploadError: '發生錯誤',
        noSchematic: '未選取藍圖',
        editLmVersion: '修改投影版本',
        editLmVersionHint: '修改建築投影，自身版本控制器',
        airBlocks: '空氣方塊',
        clearable: '可清除',
        clearAirBlocks: '清除空氣方塊',
        clearAirBlocksHint: '清除 BE 藍圖中的空氣方塊，並將對應索引改為 -1',
        confirmClearAirBlocks: '清除前請確認目前藍圖包含空氣方塊',
        clearAirBlocksSuccess: '空氣方塊清除完成',
        targetVersion: '目標輸出版本',
        confirmTargetVersion: '修改前請確認目標版本',
        cancel: '取消',
        confirmEdit: '確認修改'
    },
    toolsSplit: {
        splitMethod: '分割方式',
        verticalSplit: '垂直分層',
        horizontalSplit: '水平區域',
        gridSplit: '網格劃分',
        lengthX: '長度(X)',
        widthY: '寬度(Y)',
        xz: 'X×Z',
        error: '發生了一個錯誤: {error}',
        splitAlert: '切割過程中請勿切換藍圖或關閉頁面，下載為一次性臨時檔案。',
        splitCount: '切割數量',
        originalSize: '原始尺寸',
        cannotSplit: '不足，無法分割為{count}份',
        executeSplit: '執行分割',
        splitSize: '分割後尺寸',
        splitResult: '分割結果',
        downloadAll: '打包下載',
        file: '個檔案',
        download: '下載',
        splitResultHint: '執行分割後將在此顯示結果',
        splitButtonHint: '點擊左側「執行分割」按鈕生成切割後的檔案',
        airFrame: '空氣框架',
        airFrameHint: '為切割後的藍圖添加空氣框架',
        airFrameTooltip: '添加空氣框架防止切割後藍圖大小不一'
    },
    toolsStats: {
        total: '共',
        material: '個材料',
        exportCsv: '匯出csv',
        list: '列表',
        chart: '圖表',
        materialName: '材料名稱',
        count: '數量',
        percentage: '占比',
        noMaterialData: '暫無材料資料',
        noChartData: '暫無資料可供圖表展示'
    },
    toolsThreeD: {
        largeSizeSingleLayer: '藍圖尺寸過大，已預設啟用單層顯示',
        error: '發生了一個錯誤: {error}',
        currentLayer: '當前層',
        singleLayer: '單層顯示',
        singleLayerHint: '只顯示選中的當前層',
        loadingStructure: '結構加載中...',
        confirmLargeLoad: '該藍圖體積過大，尺寸{size}，是否確認加載？加載會佔用大量記憶體，甚至導致崩潰',
        confirmLoad: '確認加載',
        hideMaterialList: '隱藏物品列表',
        showMaterialList: '顯示物品列表',
        freeView: '自由視角',
        frontView: '前視圖',
        sideView: '側視圖',
        topView: '俯視圖',
        exportView: '導出視圖',
        exportObjPackage: '導出 OBJ',
        objExportSelectDirectory: '選擇 OBJ 資源包導出目錄',
        objExporting: '正在導出 OBJ/MTL/貼圖...',
        objExportCancel: '取消導出',
        objExportCancelled: '已取消 OBJ 導出',
        objExportPreparing: '正在準備導出檔案...',
        objExportGeometryProgress: '正在寫入幾何：{built}/{total} 個分塊，{triangles} 個三角面，已寫入 {size}',
        objExportWritingMaterial: '正在寫入材質檔案...',
        objExportWritingTexture: '正在寫入貼圖資源...',
        objExportFinalizing: '正在完成導出...',
        objExportNoStructure: '結構預覽尚未準備好',
        objExportEmpty: '目前結構沒有可導出的幾何資料',
        objExportSuccess: 'OBJ/MTL/貼圖已導出成功（{triangles} 個三角面）',
        objExportError: 'OBJ 資源包導出失敗：{error}',
        viewsNotReady: '視圖尚未準備好',
        exportSuccess: '導出成功',
        exportError: '導出失敗：{error}',
        annotation: '標註',
        blockId: 'ID',
        blockCoord: '座標',
        blockProperties: '屬性',
        containerItems: '容器內物品',
        size: '尺寸',
        author: '作者',
        version: '版本',
        ModelToSchem: '模型轉藍圖',
        confirmModelExport: '確認導出',
        modelMapArtNotReady: '模型資料尚未載入完成',
        modelMapArtColorTableMissing: '地圖畫顏色配置尚未載入',
        modelMapArtNoConvertibleBlocks: '目前模型沒有可轉換為地圖畫的方塊',
        modelMapArtExportSuccess: '模型轉藍圖成功，可前往倉庫查看',
        modelMapArtExportError: '模型轉藍圖失敗：{error}',
        mainType: '主類型',
        subType: '子類型',
        axisOrientation: '法線軸朝向',
        max3dHeight: '立體最大高度',
        enableMapArt3d: '啟用立體地圖畫',
        enableDithering: '啟用抖動算法',
        replaceAir: '透明像素替換為空氣'
    },
    common: {
        save: '儲存',
        cancel: '取消',
        delete: '刪除',
        edit: '編輯',
        create: '建立',
        search: '搜尋',
        loading: '載入中...',
        success: '成功',
        error: '錯誤',
        confirm: '確認',
        back: '返回'
    },
    menu: {
        home: '首頁',
        settings: '設定',
        about: '關於'
    },
    about: {
        title: '關於',
        version: '版本: v{version}',
        actions: {
            checkUpdate: '檢查更新',
            changelog: '更新日誌',
            github: 'GitHub',
            website: '官方網站',
            sponsor: '贊助專案',
            faq: '常見問題→'
        },
        description: {
            title: '軟體說明',
            content: '軟體採用 Tauri，後端基於 Rust，前端使用 Vue。\n分離化設計讓軟體效能得到保障，Rust 安全設計，效能更好，記憶體安全高效。'
        },
        schematicSite: {
            title: '藍圖站',
            description: '支援多種藍圖的網站，提供私有和公開多種模式，可以在線預覽藍圖\n提供線上的藍圖轉換功能，材料統計，可將網站中藍圖快速匯入到本地',
            visit: '前往網站→'
        },
        tauri: {
            title: 'Tauri 2.0',
            tooltip: '軟體基於 Tauri 2.0 開發製作',
            currentVersion: '目前版本: {version}'
        },
        license: {
            title: 'GNU Affero General Public License',
            tooltip: '允許修改和分發，但必須開源修改後的程式碼並保留版權宣告，禁止未經授權商業使用',
            copyright: '© 2025 MCS Tools. 所有權利依據 AGPL-3.0 授權',
            viewLicense: '檢視完整協議'
        },
        developers: {
            title: '核心開發人員',
            tooltip: '參與開發及代表明確遵守 AGPL V3 協議，改版、轉發請註明所有開發人員和協議',
            author: '作者'
        }
    },
    home: {
        title: '藍圖工具箱',
        stats: {
            localSchematics: '本地藍圖總數',
            cloudSchematics: '雲端藍圖總數',
            welcome: '歡迎回來'
        },
        upload: {
            title: '藍圖處理',
            dragDrop: '拖放檔案或點選上傳',
            supportedFormats: '支援格式：nbt、litematic、schem、json、mcstruct（最大50MB）允許多選',
            selectFile: '選擇檔案',
            uploadSuccess: '成功上傳 {count} 個檔案',
            uploadError: '發生錯誤：{error}'
        },
        supportedTypes: {
            title: '支援藍圖類型',
            vanilla: {
                title: '香草結構',
                desc: 'Minecraft 原版支援的藍圖格式，Create 模組也採用了這種格式'
            },
            buildingGadgets: {
                title: 'Building Gadgets',
                desc: '科技模組包最常見的輔助建築工具'
            },
            litematica: {
                title: 'Litematica',
                desc: '生存電路玩家必備工具'
            },
            worldEdit: {
                title: 'WorldEdit',
                desc: '經典建築工具，沿用至今，新版axiom也採用了這種藍圖格式'
            },
            bedrock: {
                title: 'MC BE',
                desc: 'Minecraft 基岩版採用的藍圖格式，目前未完全適配'
            }
        }
    },
    settings: {
        darkMode: '深色模式',
        lightMode: '淺色模式',
        title: '設定',
        update: {
            title: '更新設定',
            autoUpdate: '啟用自動更新',
            source: '更新源設定',
            sourcePlaceholder: '選擇或輸入更新源',
            sourceNoData: '輸入有效的HTTP地址'
        },
        debug: {
            title: '除錯模式',
            enable: '啟用除錯模式',
            open: '開啟除錯',
            openDev: '開啟開發者模式',
            tip: '除錯模式入口僅在 Tauri 偵錯包中可用。請使用 `pnpm tauri:build:debug` 打包後，再到此處開啟開發者工具。'
        },
        theme: {
            title: '跟隨主題',
            autoTheme: '啟用系統跟隨（頁面主題將跟隨 Windows 主題變化）'
        },
        resources: {
            title: '資源檔案',
            clear: '清除資源檔案(將刪除所有資源檔案，你儲存的藍圖)',
            clearConfirm: '確認清除',
            clearWarning: '清除將導致資料全部遺失，建議先進行備份',
            openFolder: '開啟資源資料夾',
            openFolderBtn: '開啟目錄'
        },
        language: {
            title: '語言設定',
            select: '語言選擇'
        },
        resourceSetting: {
            title: '資源管理',
            refresh: '重新整理',
            status: {
                installed: '已安裝',
                notInstalled: '未安裝',
                updateAvailable: '可更新',
                downloading: '下載中',
                unknown: '未知'
            },
            noDescription: '暫無描述',
            blocks: '方塊',
            items: '物品',
            download: '下載',
            update: '更新',
            delete: '刪除',
            noResources: '沒有找到資源',
            deleteDialog: {
                title: '確認解除安裝',
                message: '確定要解除安裝資源 {name} 嗎？',
                hint: '該操作將刪除本機資源檔案，可以重新下載。',
                cancel: '取消',
                confirm: '確認解除安裝'
            },
            toast: {
                downloading: '該資源正在下載中...'
            }
        }
    },
    updater: {
        dialog: {
            title: '發現新版本 {version}',
            releaseDate: '發布日期: {date}',
            downloading: '下載中',
            downloaded: '已下載',
            speed: '下載速度',
            eta: '預計剩餘時間',
            unknownTotal: '總大小未知',
            calculating: '計算中...',
            almostDone: '即將完成',
            installingHint: '請勿關閉應用程式，正在完成安裝',
            updateNow: '立即更新',
            remindLater: '稍後提醒',
            backgroundDownload: '背景下載'
        },
        restart: {
            title: '更新準備就緒',
            installedComplete: '已安裝完成',
            autoRestart: '{seconds} 秒後自動重新啟動',
            restartNow: '立即重新啟動',
            restartLater: '稍後重新啟動'
        },
        status: {
            waiting: '等待下載',
            preparing: '正在準備下載更新包',
            downloading: '正在下載更新包',
            downloadingUnknownSize: '正在下載更新包（總大小未知）',
            installing: '下載完成，正在安裝更新',
            installedAutoRestart: '已安裝完成，{seconds} 秒後自動重新啟動'
        },
        toast: {
            foundVersion: '發現新版本: {version}，發布日期 {date}，更新說明：{body}',
            noVersion: '未發現新版本',
            notAvailable: '未找到可用更新',
            checkFailed: '檢查更新失敗: {error}',
            downloadFailed: '更新下載失敗: {error}',
            restartingSoon: '更新完成，即將自動重新啟動'
        },
        units: {
            unknown: '未知'
        },
        time: {
            hoursMinutesSeconds: '{hours}小時 {minutes}分 {seconds}秒',
            minutesSeconds: '{minutes}分 {seconds}秒',
            seconds: '{seconds}秒'
        }
    },
    messages: {
        clearSuccess: '已清除資源檔案，將在5秒後重新啟動',
        error: '發生錯誤: {error}',
        fetchError: '取得原理圖失敗: {error}'
    },
    tools: {
        title: '藍圖編輯',
        upload: '上傳藍圖',
        noSchematic: '未選取目標藍圖',
        schematicId: '藍圖ID: {id}',
        tabs: {
            schematic: '藍圖詳情',
            history: '版本管理',
            split: '藍圖分割',
            replace: '方塊替換',
            convert: '藍圖轉換',
            data: '源資料檢視',
            stats: '材料統計',
            threeD: '結構預覽'
        },
        convert: {
            title: '藍圖轉換',
            tip: '大型藍圖的轉換耗時可能過長請耐心等待',
            oneClickConvert: '一鍵轉換',
            convertToFormat: '轉換到該格式',
            confirmStart: '確認開始',
            confirmExport: '確認匯出',
            cancel: '取消',
            targetVersion: '目標輸出版本',
            waitingTip: '大型藍圖轉換需要一定時間等待',
            noParams: '無轉換參數，大型藍圖轉換需要一定時間等待',
            alreadyExists: '已存在',
            formats: {
                vanilla: {
                    title: '香草結構藍圖',
                    desc: '適配 Minecraft 原版結構方塊格式',
                    ext: 'nbt'
                },
                litematica: {
                    title: 'Litematica',
                    desc: '適配 Minecraft 建築 Litematica 格式',
                    ext: 'litematic'
                },
                worldEdit: {
                    title: 'WorldEdit',
                    desc: '適配新版 1.16+ WorldEdit 模組和最新版 axiom',
                    ext: 'schem',
                    versions: {
                        latest: '0: WE最新格式',
                        legacy: '1: WE 1.16-'
                    }
                },
                buildingGadgets: {
                    title: 'Building Gadgets',
                    desc: '適配 1.12 + Building Gadgets 三種變種格式藍圖',
                    ext: 'json',
                    versions: {
                        latest: '0: BG 最新格式',
                        modern: '1: BG 1.16+',
                        legacy: '2: BG 1.12+'
                    }
                },
                bedrock: {
                    title: 'MC BE',
                    desc: '適配 1.18+ Minecraft 基岩版原版結構方塊格式',
                    ext: 'mcstructure'
                }
            },
            meta: {
                extension: '副檔名',
                originalSize: '原始大小',
                version: '版本',
                subVersion: '子版本',
                exists: '已存在',
                gzipCompression: 'Gzip壓縮',
                hasSubVersions: '存在子版本'
            }
        }
    },
    schematics: {
        title: '藍圖倉庫',
        local: '本地藍圖',
        web: '網路藍圖',
        upload: '上傳藍圖',
        source: '站點來源',
        sites: {
            mcs: 'MCS:www.mcschematic.top',
            cms: 'CMS:www.creativemechanicserver.com'
        }
    },
    report: {
        title: '問題回報',
        subtitle: '回報管道',
        tip: '有問題先不要盲目，亂求醫。先嘗試自己解決一下！',
        channels: {
            github: {
                title: 'GitHub Issue',
                desc: '透過Github Issue向我們回報bug和問題'
            },
            qqGroup: {
                title: 'QQ群',
                desc: '加入官方QQ群回報問題'
            },
            qqChannel: {
                title: 'QQ頻道',
                desc: '加入官方QQ頻道回報問題'
            }
        },
        placeholder: '還沒有，這只是個佔位元'
    },
    others: {
        title: '工具箱',
        tabs: {
            mapArt: '地圖畫',
            ModelToSchem: '模型轉藍圖',
            redstoneMusic: '紅石音樂'
        },
        modelToSCHEM: {
            tip: '基於地圖畫方塊與顏色對照表，將目前已選藍圖模型投影並導出為地圖畫藍圖。',
            noSchematic: '未偵測到目前藍圖，請先在藍圖相關頁面選擇並載入藍圖。',
            selectModelFile: '選擇模型檔案（OBJ / GLTF / GLB / STL）',
            mtlFileOptional: 'MTL 材質檔（可選）',
            textureFilesOptional: '紋理圖片（可選，多選）',
            exportName: '導出檔名',
            loadingModel: '正在載入模型...',
            previewPlaceholder: '請先載入模型檔案以開始預覽',
            noModel: '請先選擇並載入模型檔案',
            previewNotReady: '預覽尚未準備好',
            unsupportedFormat: '僅支援 OBJ / GLTF / GLB / STL 檔案',
            loadError: '模型載入失敗: {error}'
            ,voxelResolution: '體素解析度（最大邊長方塊數）'
            ,sampleDensity: '表面取樣密度'
            ,autoVoxelResolution: '依模型大小自動調整體素解析度'
            ,voxelAutoHint: '目前為自動解析度模式，手動體素解析度輸入不會生效'
            ,modelMetrics: '模型最大邊長: {size}，三角面數: {triangles}'
            ,showVoxelPreview: '顯示體素建築預覽'
            ,modelPreviewTitle: '原模型預覽'
            ,voxelPreviewTitle: '體素建築預覽'
            ,refreshToPreview: '點擊左側「刷新」生成體素建築預覽'
            ,colorMatch: '色彩匹配算法'
            ,matchModeRgb: 'RGB 歐式'
            ,matchModeWeighted: '加權距離'
            ,matchModeRedmean: 'Redmean'
            ,brightness: '亮度'
            ,contrast: '對比度'
            ,saturation: '飽和度'
            ,noSelectedBlocks: '請先在方塊選擇器中選擇至少一種方塊'
            ,noVoxelResult: '體素化結果為空，請提高解析度或取樣密度'
            ,voxelResult: '體素結果：{blocks} 方塊，尺寸 {size}'
        }
    },
    individuation: {
        title: '個人化設定',
        opacity: {
            title: '不透明度',
            value: '{value}%'
        },
        theme: {
            title: '主題配色',
            options: {
                grey: '預設灰白',
                blue: '蔚藍主題',
                darkBlue: '深藍之夜',
                green: '清新綠意',
                orange: '活力橘',
                yellow: '鳳梨黃',
                brown: '橡木棕',
                greyDark: '暗色模式'
            }
        },
        background: {
            title: '背景設定',
            imageInfo: '圖片資訊',
            fileName: '檔案名稱',
            fileSize: '檔案大小',
            resolution: '解析度',
            layoutMode: '佈局方式',
            layoutModes: {
                stretch: '拉伸',
                repeat: '平鋪',
                contain: '適應',
                cover: '填充'
            },
            actions: {
                clear: '清除背景',
                refresh: '重新整理背景',
                select: '選擇背景檔案'
            }
        },
        font: {
            title: '字型設定',
            fontInfo: '字型資訊',
            fileName: '檔案名稱',
            fileSize: '檔案大小',
            actions: {
                clear: '清除字型',
                refresh: '重新整理字型',
                select: '選擇字型檔案'
            },
            effect: {
                title: '字型效果展示',
                content1: '繁體中文字型演示',
                content2: '加粗效果：繁體中文字型演示',
                content3: 'The quick brown fox jumps over the lazy dog.',
                content4: 'Italic style shows elegance in typography.',
                content5: '常規：0123456789',
                content6: '特殊樣式：① 𝟙𝟚𝟛₄₅₆ ⓺⓻⓼⓽',
            }
        }
    }
}
