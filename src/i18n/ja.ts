export default {
  mapImage2d: {
    fileName: 'ファイル名',
    resolution: '解像度',
    selectImageFile: '画像ファイルを選択',
    uploadImageTip: 'まず元画像をアップロードしてください',
    exportWidth: '出力幅',
    exportHeight: '出力高さ',
    suggestSameRatio: '元サイズと同じ比率を推奨',
    enableDithering: 'ディザリング有効化',
    ditheringHint: '色のディザリングで細部を向上',
    ditheringTooltip: 'Floyd-Steinbergアルゴリズムで誤差拡散・色遷移を最適化',
    airBlock: '空気ブロック',
    airBlockHint: '透明SRGBAを空気ブロックに置換',
    airBlockTooltip: '作業量を減らし、スタイルを変更',
    refresh: 'リフレッシュ',
    exportSchematic: '設計図を出力',
    exportImage: '画像を出力',
    blockSelector: 'ブロックセレクター',
    processingImage: '画像を処理中...',
    waitingForImage: '画像入力待ち...',
    exportToType: '指定タイプの設計図に出力します。',
    mainType: 'メインタイプ',
    subType: 'サブタイプ',
    axisOrientation: '法線軸の向き',
    max3dHeight: '立体最大高さ',
    cancel: 'キャンセル',
    confirmExport: '出力を確認'
  },
  redStoneMusic: {
    unimplemented: '未実装です。'
  },
  localData: {
    clickToExpandFilter: 'フィルター条件を展開',
    keywordFilter: 'キーワードフィルター',
    inputBlueprintNameOrDesc: '設計図名または説明を入力',
    allBlueprints: 'すべての設計図',
    createCategory: 'カテゴリ作成',
    createNewCategory: '新しいカテゴリを作成',
    tagName: 'タグ名',
    cancel: 'キャンセル',
    create: '作成',
    confirmDelete: '削除確認',
    confirmDeleteBlueprint: '設計図を完全に削除しますか',
    confirmDeleteCategory: 'カテゴリを削除しますか',
    thisActionCannotBeUndone: 'この操作は元に戻せません！',
    exitMultiSelect: 'マルチ選択終了',
    multiSelect: 'マルチ選択',
    batchExport: '一括エクスポート',
    selectAll: 'すべて選択',
    clearAll: '選択解除',
    unparsed: '未解析',
    currentVersion: '現在のバージョン',
    export: 'エクスポート',
    loadingMore: 'データを読み込み中...',
    noMoreData: 'これ以上データはありません。'
  },
  webData: {
    clickToExpandFilter: 'フィルター条件を展開',
    keywordFilter: 'キーワードフィルター',
    inputBlueprintNameOrDesc: '設計図名または説明を入力',
    blueprintType: '設計図タイプ',
    sortType: '並び替え方法',
    import: 'インポート',
    goTo: '移動',
    loadingMore: 'データを読み込み中...',
    noMoreData: 'これ以上データはありません。',
    unparsed: '未解析'
  },
  toolsData: {
    loading: '構造を読み込み中...',
    tooLarge: 'この設計図は大きすぎます（サイズ: {size}）。本当に読み込みますか？大量のメモリを消費し、クラッシュする可能性があります。',
    confirmLoad: '読み込みを確認',
    confirmSave: '保存を確認',
    noEditForType4: 'この設計図タイプは編集できません。JSONを手動で編集してください！',
    saveWarning: '変更を保存しますか？データの正確性は検証されません。ご自身でご確認ください！',
    cancel: 'キャンセル',
    confirmSaveChange: '変更を保存',
    loadFailed: 'ソースデータの読み込みに失敗しました: {error}',
    saveSuccess: 'データが保存されました',
    saveError: 'エラーが発生しました: {error}'
  },
  toolsHistory: {
    unparsed: '未解析',
    exportSchematic: '設計図をエクスポート',
    diffCompare: '差分比較',
    currentRequirements: '現在の必要素材',
    diffRequirements: '素材差分比較'
  },  
  toolsConvert: {
    longTimeTip: '大きな設計図の変換には時間がかかる場合があります。しばらくお待ちください',
    extType: '拡張子タイプ',
    originSize: '元サイズ',
    version: 'バージョン',
    subVersion: 'サブバージョン',
    weSubVersion0: '0: WE最新フォーマット',
    weSubVersion1: '1: WE 1.16-',
    bgSubVersion0: '0: ヘルパー最新フォーマット',
    bgSubVersion1: '1: ヘルパー1.16+',
    bgSubVersion2: '2: ヘルパー1.12+',
    oneClick: 'ワンクリック変換',
    gzipCompression: 'Gzip圧縮',
    convertSuccess: '変換完了、再読み込みでエクスポート可能',
    error: 'エラーが発生しました: {error}',
    unknownTitle: '不明な形式',
    unknownDesc: '不明な形式の説明',
    desc: 'フォーマット説明',
    fileInfo: 'ファイル情報',
    fileInfoDesc: '変換する設計図ファイルを選択してください。.litematic、.schematic、.mcstructure対応',
    selectFile: 'ファイルを選択',
    maxSize: '最大100MB',
    litematicTitle: '投影設計図',
    litematicDesc: 'Minecraft建築投影設計図フォーマット対応',
    availableSubVersion: '利用可能なサブバージョン',
    exist: '存在済み',
    existSubVersion: 'サブバージョンが存在します',
    convertToThis: 'この形式に変換',
    createTitle: 'バニラ構造',
    createDesc: 'JEバニラ構造ブロック・Create対応',
    weTitle: 'WorldEdit',
    weDesc: 'WorldEdit 1.16+・最新版axiom対応',
    bgTitle: '建築ヘルパー',
    bgDesc: '1.12+建築ヘルパー3種バリアント対応',
    beTitle: 'MC BE',
    beDesc: 'Minecraft BE 1.18+構造ブロックフォーマット対応',
    toLitematic: '投影設計図へ変換',
    toCreate: 'バニラ構造へ変換',
    toWE: 'WorldEditへ変換',
    toBG: '建築ヘルパーへ変換',
    toBE: 'MC BEへ変換',
    selectSubVersion: 'サブバージョン選択',
    selectSubVersionTip: '変換先のサブバージョンを選択してください。',
    cancel: 'キャンセル',
    confirm: '確認',
    startConfirm: '開始確認',
    exportConfirm: 'エクスポート確認',
    convertToTargetVersion: '目標バージョンに変換',
    hasSubVersion: 'サブバージョンが存在します'
  },
  toolsReplace: {
    idRequired: 'ブロックIDは必須です',
    idFormat: '形式: namespace:block_name',
    propFormat: '各行は key=value 形式で入力',
    invalidIdFormat: '無効なブロックID形式',
    loadBlockError: 'ブロックデータの読み込みに失敗しました',
    quantityGreaterThanZero: '置換数は0より大きくする必要があります',
    selectBlockAndTarget: '置換するブロックと対象を選択してください',
    selectBlockAndTargetDetails: '置換するブロックと対象（詳細モード）を選択してください',
    replaceSuccess: 'ブロック置換が完了しました。倉庫で確認してください',
    replaceFailed: '置換操作に失敗しました',
    error: 'エラーが発生しました: {error}',
    briefMode: '簡易モード',
    detailsMode: '詳細モード',
    searchBlock: 'ブロック検索',
    id: 'ID',
    replaceTo: '置換先（ID入力または選択）',
    customId: 'カスタムID',
    replaceQuantity: '置換数',
    globalReplaceLocked: '全体置換ロック: {block} の数量 {num}',
    selectBlockFirst: '置換するブロックを選択してください',
    globalReplace: '全体置換',
    addToList: 'リストに追加',
    executeReplace: '置換を実行',
    searchBlockWithProps: 'ブロック検索（属性フィルタ対応）',
    blockIdLabel: 'ブロックID（例: minecraft:stone）',
    blockIdPlaceholder: 'namespace:block_name',
    blockPropsLabel: 'ブロック属性',
    blockPropsPlaceholder: '1行に1属性、形式: key=value',
    blockPropsTooltip: '1行ごとに属性を入力 例: color=blue',
    preview: 'プレビュー',
    props: '属性',
    noRules: '置換ルールなし',
    mode: 'モード',
    originalBlock: '元ブロック',
    newBlock: '新ブロック',
    quantity: '数量',
    action: '操作',
    defaultGlobal: 'デフォルト全体',
    delete: '削除',
    confirmReplace: '置換操作の確認',
    replaceExportHint: '置換は新しい設計図として出力されます',
    replacePreview: '{count}件のブロックルールを置換予定',
    cancel: 'キャンセル',
    confirmExecute: '実行を確認'
  },
  toolsSchematic: {
    basicInfo: '設計図基本情報',
    id: 'ID',
    name: '名称',
    type: 'タイプ',
    size: 'サイズ',
    lmVersion: '投影フォーマットバージョン',
    status: '状態',
    deleted: '削除済み',
    normal: '正常',
    creator: '作成者',
    unknown: '不明',
    version: 'バージョン',
    updatedAt: '更新日時',
    tags: '設計図タグ',
    tagsHint: '入力後Enterでタグ追加',
    description: '設計図説明',
    updateFile: '設計図ファイル更新',
    uploadSuccess: '{count}個のファイルをアップロードしました',
    uploadError: 'エラー発生',
    noSchematic: '設計図未選択',
    editLmVersion: '投影バージョン編集',
    editLmVersionHint: '建築投影・バージョン管理',
    targetVersion: '出力バージョン',
    confirmTargetVersion: '編集前に目標バージョンを確認してください',
    cancel: 'キャンセル',
    confirmEdit: '編集を確認'
  },
  toolsSplit: {
    splitMethod: '分割方法',
    verticalSplit: '垂直分割',
    horizontalSplit: '水平エリア',
    gridSplit: 'グリッド分割',
    lengthX: '長さ(X)',
    widthY: '幅(Y)',
    xz: 'X×Z',
    error: 'エラーが発生しました: {error}',
    splitAlert: '分割中は設計図の切り替えやページの閉鎖をしないでください。ダウンロードは一時ファイルです。',
    splitCount: '分割数',
    originalSize: '元のサイズ',
    cannotSplit: 'が不足しており、{count}分割できません',
    executeSplit: '分割実行',
    splitSize: '分割後サイズ',
    splitResult: '分割結果',
    downloadAll: '一括ダウンロード',
    file: 'ファイル',
    download: 'ダウンロード',
    splitResultHint: '分割後、ここに結果が表示されます',
    splitButtonHint: '左の「分割実行」ボタンをクリックして分割ファイルを生成',
    airFrame: 'エアフレーム',
    airFrameHint: '分割後の設計図にエアフレームを追加',
    airFrameTooltip: '分割後のサイズの不一致を防ぐためにエアフレームを追加'
  },
  toolsStats: {
    total: '合計',
    material: '材料',
    exportCsv: 'CSV出力',
    list: 'リスト',
    chart: 'チャート',
    materialName: '材料名',
    count: '数量',
    percentage: '割合',
    noMaterialData: '材料データなし',
    noChartData: 'チャート表示可能なデータなし'
  },
  toolsThreeD: {
    largeSizeSingleLayer: '設計図が大きすぎるため、単層表示がデフォルトで有効になりました',
    error: 'エラーが発生しました: {error}',
    currentLayer: '現在の層',
    singleLayer: '単層表示',
    singleLayerHint: '選択した層のみ表示',
    loadingStructure: '構造を読み込み中...',
    confirmLargeLoad: 'この設計図は非常に大きいです（サイズ: {size}）。本当に読み込みますか？大量のメモリを消費し、クラッシュする可能性があります。',
    confirmLoad: '読み込みを確認',
    hideMaterialList: 'マテリアルリストを非表示',
    showMaterialList: 'マテリアルリストを表示',
    freeView: '自由視点',
    frontView: '正面図',
    sideView: '側面図',
    topView: '平面図',
    exportView: 'ビューをエクスポート',
    viewsNotReady: 'ビューの準備ができていません',
    exportSuccess: 'エクスポート成功',
    exportError: 'エクスポート失敗: {error}',
    annotation: '注釈',
    blockId: 'ID',
    blockCoord: '座標',
    blockProperties: 'プロパティ',
    containerItems: 'コンテナ内アイテム',
    size: 'サイズ',
    author: '作者',
    version: 'バージョン'
  },
  common: {
    save: '保存',
    cancel: 'キャンセル',
    delete: '削除',
    edit: '編集',
    create: '作成',
    search: '検索',
    loading: '読み込み中...',
    success: '成功',
    error: 'エラー',
    confirm: '確認',
    back: '戻る'
  },
  menu: {
    home: 'ホーム',
    settings: '設定',
    about: '概要'
  },
  home: {
    title: 'シェマティックツールボックス',
    stats: {
      localSchematics: 'ローカルシェマティック',
      cloudSchematics: 'クラウドシェマティック',
      welcome: 'おかえりなさい'
    },
    upload: {
      title: 'シェマティック処理',
      dragDrop: 'ファイルをドラッグ＆ドロップするか、クリックしてアップロード',
      supportedFormats: '対応フォーマット：nbt、litematic、schem、json、mcstruct（最大50MB）複数ファイル可',
      selectFile: 'ファイルを選択',
      uploadSuccess: '{count}個のファイルをアップロードしました',
      uploadError: 'エラーが発生しました：{error}'
    },
    supportedTypes: {
      title: '対応シェマティックタイプ',
      vanilla: {
        title: 'バニラ構造',
        desc: 'Minecraftのバニラでサポートされているシェマティック形式、Create modでも使用'
      },
      buildingGadgets: {
        title: 'Building Gadgets',
        desc: 'テックモッドパックで最も一般的な建築補助ツール'
      },
      litematica: {
        title: 'Litematica',
        desc: 'テクニカルMinecraftプレイヤーにとって必須のツール'
      },
      worldEdit: {
        title: 'WorldEdit',
        desc: 'クラシックな建築ツール、現在も使用され、Axiomなどの新しいツールでも採用'
      },
      bedrock: {
        title: 'MC BE',
        desc: 'Minecraft Bedrock Editionのシェマティック形式、現在完全には対応していません'
      }
    }
  },
  settings: {
    darkMode: 'ダークモード',
    lightMode: 'ライトモード',
    title: '設定',
    update: {
      title: '更新設定',
      autoUpdate: '自動更新を有効にする',
      source: '更新ソース設定',
      sourcePlaceholder: '更新ソースを選択または入力',
      sourceNoData: '有効なHTTPアドレスを入力してください'
    },
    debug: {
      title: 'デバッグモード',
      enable: 'デバッグモードを有効にする',
      open: 'デバッグを開く',
      openDev: 'デバッグDEVを開く'
    },
    theme: {
      title: 'テーマ追従',
      autoTheme: 'システムテーマ追従を有効にする（ページテーマがWindowsテーマの変更に追従します）'
    },
    resources: {
      title: 'リソースファイル',
      clear: 'リソースファイルをクリア（すべてのリソースファイルと保存されたブループリントが削除されます）',
      clearConfirm: 'クリアを確認',
      clearWarning: 'クリアするとすべてのデータが失われます。先にバックアップしてください',
      openFolder: 'リソースフォルダを開く',
      openFolderBtn: 'ディレクトリを開く'
    },
    language: {
      title: '言語設定',
      select: '言語選択'
    },
    resourceSetting: {
      title: 'リソース管理',
      refresh: 'リフレッシュ',
      status: {
        installed: 'インストール済み',
        notInstalled: '未インストール',
        updateAvailable: '更新可能',
        downloading: 'ダウンロード中',
        unknown: '不明'
      },
      noDescription: '説明なし',
      blocks: 'ブロック',
      items: 'アイテム',
      download: 'ダウンロード',
      update: '更新',
      delete: '削除',
      noResources: 'リソースが見つかりません',
      deleteDialog: {
        title: 'アンインストールの確認',
        message: '{name} をアンインストールしますか？',
        hint: 'ローカルリソースファイルが削除されます。再ダウンロードできます。',
        cancel: 'キャンセル',
        confirm: 'アンインストール確認'
      },
      toast: {
        downloading: 'このリソースはダウンロード中です...'
      }
    }
  },
  messages: {
    clearSuccess: 'リソースファイルをクリアしました。5秒後に再起動します',
    error: 'エラーが発生しました: {error}',
    fetchError: 'シェマティックの取得に失敗しました: {error}'
  },
  tools: {
    title: 'シェマティックエディタ',
    upload: 'シェマティックをアップロード',
    noSchematic: 'シェマティックが選択されていません',
    schematicId: 'シェマティックID: {id}',
    tabs: {
      schematic: 'シェマティック詳細',
      history: 'バージョン管理',
      split: 'シェマティック分割',
      replace: 'ブロック置換',
      convert: 'シェマティック変換',
      data: 'ソースデータ表示',
      stats: '材料統計',
      threeD: '3Dプレビュー'
    },
    convert: {
      title: 'シェマティック変換',
      tip: '大きなシェマティックの変換には時間がかかる場合があります、お待ちください',
      oneClickConvert: 'ワンクリック変換',
      convertToFormat: 'フォーマットに変換',
      confirmStart: '開始確認',
      confirmExport: 'エクスポート確認',
      cancel: 'キャンセル',
      targetVersion: '出力バージョン',
      waitingTip: '大きなシェマティックの変換には待ち時間が必要です',
      noParams: '変換パラメータなし、大きなシェマティックの変換には待ち時間が必要です',
      alreadyExists: '既に存在',
      formats: {
        vanilla: {
          title: 'バニラ構造',
          desc: 'Minecraft バニラ構造ブロック形式に対応',
          ext: 'nbt'
        },
        litematica: {
          title: 'Litematica',
          desc: 'Minecraft Litematica シェマティック形式に対応',
          ext: 'litematic'
        },
        worldEdit: {
          title: 'WorldEdit',
          desc: 'WorldEdit mod 1.16+ と最新の axiom に対応',
          ext: 'schem',
          versions: {
            latest: '0: 最新WE形式',
            legacy: '1: WE 1.16-'
          }
        },
        buildingGadgets: {
          title: 'Building Gadgets',
          desc: 'Building Gadgets 1.12+ の3つのバリアント形式に対応',
          ext: 'json',
          versions: {
            latest: '0: 最新BG形式',
            modern: '1: BG 1.16+',
            legacy: '2: BG 1.12+'
          }
        },
        bedrock: {
          title: 'MC BE',
          desc: 'Minecraft Bedrock Edition 1.18+ 構造ブロック形式に対応',
          ext: 'mcstructure'
        }
      },
      meta: {
        extension: '拡張子タイプ',
        originalSize: '元のサイズ',
        version: 'バージョン',
        subVersion: 'サブバージョン',
        exists: '存在',
        gzipCompression: 'Gzip圧縮',
        hasSubVersions: 'サブバージョンあり'
      }
    }
  },
  schematics: {
    title: 'シェマティックリポジトリ',
    local: 'ローカルシェマティック',
    web: 'ウェブシェマティック',
    upload: 'シェマティックをアップロード',
    source: 'ソースサイト',
    sites: {
      mcs: 'MCS:www.mcschematic.top',
      cms: 'CMS:www.creativemechanicserver.com'
    }
  },
  report: {
    title: '問題報告',
    subtitle: 'フィードバックチャネル',
    tip: '問題が発生したら、まず自分で解決を試みてください！',
    channels: {
      github: {
        title: 'GitHub issue',
        desc: 'GitHub issueを通じてバグや問題を報告'
      },
      qqGroup: {
        title: 'QQグループ',
        desc: '公式QQグループに参加してバグや問題を報告'
      },
      qqChannel: {
        title: 'QQチャンネル',
        desc: '公式QQチャンネルに参加してバグや問題を報告'
      }
    },
    placeholder: 'まだ利用できません、これはプレースホルダーです'
  },
  others: {
    title: 'ツールボックス',
    tabs: {
      mapArt: 'マップアート',
      redstoneMusic: 'レッドストーンミュージック'
    }
  },
  individuation: {
    title: 'パーソナライズ設定',
    opacity: {
      title: '不透明度',
      value: '{value}%'
    },
    theme: {
      title: 'テーマカラー',
      options: {
        grey: 'デフォルトグレー',
        blue: 'アジュールテーマ',
        darkBlue: 'ダークブルーナイト',
        green: 'フレッシュグリーン',
        orange: 'ビビッドオレンジ',
        yellow: 'パイナップルイエロー',
        brown: 'オークブラウン',
        greyDark: 'ダークモード'
      }
    },
    background: {
      title: '背景設定',
      imageInfo: '画像情報',
      fileName: 'ファイル名',
      fileSize: 'ファイルサイズ',
      resolution: '解像度',
      layoutMode: 'レイアウトモード',
      layoutModes: {
        stretch: '引き伸ばし',
        repeat: 'タイル繰り返し',
        contain: '画面に合わせる',
        cover: '全体カバー'
      },
      actions: {
        clear: '背景をクリア',
        refresh: '背景を更新',
        select: '背景ファイルを選択'
      }
    },
    font: {
      title: 'フォント設定',
      fontInfo: 'フォント情報',
      fileName: 'ファイル名',
      fileSize: 'ファイルサイズ',
      actions: {
        clear: 'フォントをクリア',
        refresh: 'フォントを更新',
        select: 'フォントファイルを選択'
      },
      effect: {
        title: 'フォントプレビュー',
        content1: '日本語フォントデモ',
        content2: '太字効果：日本語フォントデモ',
        content3: 'The quick brown fox jumps over the lazy dog.',
        content4: 'Italic style shows elegance in typography.',
        content5: '標準：0123456789',
        content6: '特殊スタイル：① 𝟙𝟚𝟛₄₅₆ ⓺⓻⓼⓽',
      }
    }
  },
  about: {
    title: '概要',
    version: 'バージョン: v{version}',
    actions: {
      checkUpdate: 'アップデート確認',
      changelog: '変更履歴',
      github: 'Github',
      website: '公式サイト',
      sponsor: 'プロジェクト支援',
      faq: 'FAQ→'
    },
    description: {
      title: 'ソフトウェア説明',
      content: 'ソフトウェアはRustベースのTauriバックエンドとVueフロントエンドを使用しています。\nモジュール設計によりソフトウェアのパフォーマンスを確保し、Rustの安全性設計により優れたパフォーマンスとメモリ安全性を提供します。'
    },
    schematicSite: {
      title: 'シェマティックサイト',
      description: '複数のシェマティック形式をサポートするウェブサイトで、プライベートとパブリックの両方のモードを提供し、オンラインでシェマティックをプレビューできます\nオンラインのシェマティック変換、材料統計、ウェブサイトからのシェマティックのローカルへのクイックインポートを提供',
      visit: 'サイトへ→'
    },
    tauri: {
      title: 'Tauri 2.0',
      tooltip: 'Tauri 2.0を使用して開発されたソフトウェア',
      currentVersion: '現在のバージョン: {version}'
    },
    license: {
      title: 'GNU Affero General Public License',
      tooltip: '修正と配布を許可しますが、修正したコードをオープンソース化し、著作権表示を保持する必要があり、無許可の商用利用は禁止されています',
      copyright: '© 2025 MCS Tools. All rights licensed under AGPL-3.0',
      viewLicense: 'ライセンス全文を表示'
    },
    developers: {
      title: 'コア開発者',
      tooltip: 'すべての開発者と代表者はAGPL V3ライセンスに準拠する必要があり、修正と配布にはすべての開発者とライセンスのクレジットが必要です',
      author: '作者'
    }
  }
} 