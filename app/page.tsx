'use client';

import { useState, useEffect } from 'react';
import { Moon, Sun, BookOpen, RefreshCw, List, CheckCircle, XCircle, ArrowLeft, Play } from 'lucide-react';

// --- 型定義 ---

type Card = {
  id: number;
  question: string;
  answer: string;
};

type GameMode = 'FLASHCARD' | 'INPUT';
type OrderType = 'SEQUENTIAL' | 'RANDOM';

// ゲームの設定
type GameSettings = {
  mode: GameMode;
  order: OrderType;
  limit: number | 'ALL'; // 'ALL' または具体的な数値
  startIndex: number; // 途中から始める場合のインデックス
};

// 1回のゲームセッションの結果
type GameResult = {
  cardId: number;
  isCorrect: boolean;
  userAnswer?: string; // 入力モードの場合の回答
};

// 画面の状態
type Screen = 'MENU' | 'SETUP' | 'GAME' | 'RESULT' | 'WRONG_LIST';

// デモ用データ（読み込み失敗時のフォールバック）
const SAMPLE_CSV = `Question,Answer
Apple,りんご
Computer,コンピュータ
Japan,日本
Artificial Intelligence,人工知能
Network,ネットワーク
Database,データベース
Algorithm,アルゴリズム
Security,セキュリティ
Programming,プログラミング
Cloud,クラウド`;

// --- ユーティリティ ---

// 半角カナ・全角カナ、大文字小文字を正規化して比較する関数
const normalizeString = (str: string): string => {
  if (!str) return '';
  return str
    .trim()
    .normalize('NFKC') // 半角カナを全角カナになど正規化
    .toLowerCase()     // 大文字小文字を無視
    .replace(/\s+/g, ''); // 空白を削除（オプション：厳密にするなら残す）
};

// 配列をシャッフルする関数 (Fisher-Yates)
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export default function FlashcardApp() {
  // --- ステート ---
  const [allCards, setAllCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  
  // 画面遷移管理
  const [currentScreen, setCurrentScreen] = useState<Screen>('MENU');

  // 苦手管理 (ID -> 間違えた回数)
  const [wrongHistory, setWrongHistory] = useState<Record<number, number>>({});

  // ゲーム実行用ステート
  const [playQueue, setPlayQueue] = useState<Card[]>([]); // 実際にプレイするカード列
  const [gameResults, setGameResults] = useState<GameResult[]>([]);
  const [setupSource, setSetupSource] = useState<'ALL' | 'WRONG'>('ALL'); // 設定画面へどのソースで遷移したか

  // --- CSV読み込み (初期化) ---
  useEffect(() => {
    const parseCSV = (text: string): Card[] => {
      const rows: string[][] = [];
      let currentRow: string[] = [];
      let currentCell = '';
      let insideQuotes = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
          if (insideQuotes && nextChar === '"') {
            currentCell += '"';
            i++;
          } else {
            insideQuotes = !insideQuotes;
          }
        } else if (char === ',' && !insideQuotes) {
          currentRow.push(currentCell);
          currentCell = '';
        } else if ((char === '\r' || char === '\n') && !insideQuotes) {
          if (char === '\r' && nextChar === '\n') i++;
          currentRow.push(currentCell);
          if (currentRow.length > 1 || (currentRow.length === 1 && currentRow[0] !== '')) {
            rows.push(currentRow);
          }
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
      if (currentCell || currentRow.length > 0) {
        currentRow.push(currentCell);
        rows.push(currentRow);
      }

      const data: Card[] = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length >= 2) {
          data.push({
            id: i, // CSVの行番号をIDとする
            question: row[0].trim(),
            answer: row[1].trim()
          });
        }
      }
      return data;
    };

    const fetchCSV = async () => {
      try {
        // 本番環境用にfetchを有効化
        // Vercel等のpublicフォルダにway.csvがあれば読み込まれます
        const response = await fetch('/way.csv');
        
        if (!response.ok) {
          throw new Error(`CSV load failed: ${response.statusText}`);
        }
        
        const text = await response.text();
        const data = parseCSV(text);
        setAllCards(data);
        setLoading(false);

      } catch (error) {
        console.error('CSV load error:', error);
        // 読み込み失敗時（ローカル開発でファイルがない場合など）はサンプルデータを表示
        const data = parseCSV(SAMPLE_CSV);
        setAllCards(data);
        setLoading(false);
      }
    };

    fetchCSV();
  }, []);

  // --- レンダリング制御 ---

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  return (
    <div className={`${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-gray-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100 transition-colors duration-300">
        {/* ヘッダー (共通) */}
        <header className="p-4 bg-white dark:bg-slate-800 shadow-sm flex justify-between items-center sticky top-0 z-10">
          <h1 
            className="font-bold text-xl cursor-pointer flex items-center gap-2" 
            onClick={() => setCurrentScreen('MENU')}
          >
            <BookOpen className="w-6 h-6 text-blue-500" />
            単語帳アプリ
          </h1>
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-slate-700 transition"
          >
            {darkMode ? <Sun className="w-5 h-5 text-yellow-400" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
        </header>

        <main className="p-4 max-w-3xl mx-auto">
          {/* 画面の状態管理をAppContentに集約 */}
          <AppContent 
             screen={currentScreen}
             setScreen={setCurrentScreen}
             allCards={allCards}
             wrongHistory={wrongHistory}
             setWrongHistory={setWrongHistory}
             playQueue={playQueue}
             setPlayQueue={setPlayQueue}
             gameResults={gameResults}
             setGameResults={setGameResults}
             setupSource={setupSource}
             setSetupSource={setSetupSource}
          />
        </main>
      </div>
    </div>
  );
}

// --- サブコンポーネント群 ---

// AppContent: Stateを受け取って適切な画面を表示するラッパー
function AppContent(props: {
  screen: Screen;
  setScreen: (s: Screen) => void;
  allCards: Card[];
  wrongHistory: Record<number, number>;
  setWrongHistory: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  playQueue: Card[];
  setPlayQueue: (cards: Card[]) => void;
  gameResults: GameResult[];
  setGameResults: React.Dispatch<React.SetStateAction<GameResult[]>>;
  setupSource: 'ALL' | 'WRONG';
  setSetupSource: (s: 'ALL' | 'WRONG') => void;
}) {
  const [settings, setSettings] = useState<GameSettings>({
    mode: 'FLASHCARD',
    order: 'SEQUENTIAL',
    limit: 'ALL',
    startIndex: 0
  });

  const handleStartGame = (newSettings: GameSettings) => {
    setSettings(newSettings);
    
    // カード抽出ロジック
    let sourceCards = props.setupSource === 'ALL' 
      ? props.allCards 
      : props.allCards.filter(c => (props.wrongHistory[c.id] || 0) > 0);

    let deck = [...sourceCards];

    // シャッフル
    if (newSettings.order === 'RANDOM') {
      deck = shuffleArray(deck);
    } else {
        // 順番通りかつ開始位置指定 (ID順ではなく現在のリスト順)
        if (newSettings.startIndex > 0) {
            deck = deck.slice(newSettings.startIndex);
        }
    }

    // 枚数制限
    if (newSettings.limit !== 'ALL') {
      deck = deck.slice(0, newSettings.limit);
    }

    if (deck.length === 0) {
      alert('出題できるカードがありません');
      return;
    }

    props.setPlayQueue(deck);
    props.setGameResults([]);
    props.setScreen('GAME');
  };

  const handleGameFinish = (results: GameResult[]) => {
    props.setGameResults(results);
    
    // 履歴更新
    const newHistory = { ...props.wrongHistory };
    results.forEach(r => {
      if (!r.isCorrect) {
        newHistory[r.cardId] = (newHistory[r.cardId] || 0) + 1;
      }
    });
    props.setWrongHistory(newHistory);
    
    props.setScreen('RESULT');
  };

  switch (props.screen) {
    case 'MENU':
      return (
        <MenuScreen 
          allCount={props.allCards.length}
          wrongCount={Object.keys(props.wrongHistory).length}
          onStartAll={() => { props.setSetupSource('ALL'); props.setScreen('SETUP'); }}
          onStartWrong={() => { props.setSetupSource('WRONG'); props.setScreen('SETUP'); }}
          onShowWrongList={() => props.setScreen('WRONG_LIST')}
        />
      );
    case 'SETUP':
      return (
        <SetupScreen 
          sourceType={props.setupSource}
          totalCards={props.setupSource === 'ALL' ? props.allCards.length : Object.keys(props.wrongHistory).length}
          onStart={handleStartGame}
          onBack={() => props.setScreen('MENU')}
        />
      );
    case 'GAME':
      return (
        <GameScreen 
          cards={props.playQueue}
          settings={settings}
          onFinish={handleGameFinish}
          onBack={() => props.setScreen('MENU')}
        />
      );
    case 'RESULT':
      return (
        <ResultScreen 
          results={props.gameResults}
          allCards={props.allCards}
          onRetryWrong={() => {
             // 間違えた問題だけを対象に設定画面へ
             props.setSetupSource('WRONG');
             props.setScreen('SETUP');
          }}
          onBackToMenu={() => props.setScreen('MENU')}
        />
      );
    case 'WRONG_LIST':
      return (
        <WrongListScreen 
          allCards={props.allCards}
          wrongHistory={props.wrongHistory}
          onBack={() => props.setScreen('MENU')}
          onStartReview={() => {
            props.setSetupSource('WRONG');
            props.setScreen('SETUP');
          }}
        />
      );
    default:
      return null;
  }
}

// --- 1. メニュー画面 ---
function MenuScreen({ allCount, wrongCount, onStartAll, onStartWrong, onShowWrongList }: any) {
  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 text-center">
        <h2 className="text-3xl font-bold mb-2">Let's Study!</h2>
        <p className="text-slate-500 dark:text-slate-400">登録単語数: {allCount}</p>
      </div>

      <div className="grid gap-4">
        <button 
          onClick={onStartAll}
          className="flex items-center justify-between bg-blue-600 hover:bg-blue-700 text-white p-6 rounded-xl shadow transition group"
        >
          <div className="flex flex-col items-start">
            <span className="font-bold text-lg">問題を解く</span>
            <span className="text-blue-200 text-sm">全{allCount}問から設定</span>
          </div>
          <Play className="w-8 h-8 opacity-80 group-hover:translate-x-1 transition" />
        </button>

        <button 
          onClick={onStartWrong}
          disabled={wrongCount === 0}
          className={`flex items-center justify-between p-6 rounded-xl shadow transition group border-2
            ${wrongCount === 0 
              ? 'bg-gray-100 dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-400 cursor-not-allowed' 
              : 'bg-white dark:bg-slate-800 border-red-200 dark:border-red-900 hover:border-red-400 dark:hover:border-red-700 text-red-600 dark:text-red-400'
            }`}
        >
          <div className="flex flex-col items-start">
            <span className="font-bold text-lg">苦手克服</span>
            <span className="text-sm opacity-70">現在 {wrongCount} 問が登録中</span>
          </div>
          <RefreshCw className={`w-8 h-8 ${wrongCount > 0 ? 'group-hover:rotate-180 transition duration-500' : ''}`} />
        </button>
        
        <button 
          onClick={onShowWrongList}
          className="flex items-center justify-center gap-2 bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 p-4 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 transition"
        >
          <List className="w-5 h-5" />
          苦手リスト・分析を見る
        </button>
      </div>
    </div>
  );
}

// --- 2. 設定画面 ---
function SetupScreen({ sourceType, totalCards, onStart, onBack }: any) {
  const [mode, setMode] = useState<GameMode>('FLASHCARD');
  const [order, setOrder] = useState<OrderType>('RANDOM');
  const [limit, setLimit] = useState<number | 'ALL'>('ALL');
  const [startIndex, setStartIndex] = useState(0);

  const handleStart = () => {
    onStart({ mode, order, limit, startIndex });
  };

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-lg max-w-md mx-auto animate-in zoom-in-95 duration-300">
      <div className="flex items-center gap-2 mb-6 pb-4 border-b dark:border-slate-700">
        <button onClick={onBack} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h2 className="text-xl font-bold">出題設定</h2>
      </div>

      <div className="space-y-6">
        {/* モード選択 */}
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-2">モード</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('FLASHCARD')}
              className={`p-3 rounded-lg border-2 text-sm font-bold transition
                ${mode === 'FLASHCARD' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
            >
              単語カード
              <div className="text-xs font-normal opacity-70 mt-1">自己採点</div>
            </button>
            <button
              onClick={() => setMode('INPUT')}
              className={`p-3 rounded-lg border-2 text-sm font-bold transition
                ${mode === 'INPUT' ? 'border-blue-500 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' : 'border-slate-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700'}`}
            >
              入力テスト
              <div className="text-xs font-normal opacity-70 mt-1">自動採点(文字入力)</div>
            </button>
          </div>
        </div>

        {/* 出題順 */}
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-2">出題順</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" name="order" checked={order === 'RANDOM'} 
                onChange={() => setOrder('RANDOM')}
                className="w-5 h-5 text-blue-600"
              />
              <span>ランダム</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input 
                type="radio" name="order" checked={order === 'SEQUENTIAL'} 
                onChange={() => setOrder('SEQUENTIAL')}
                className="w-5 h-5 text-blue-600"
              />
              <span>順番通り</span>
            </label>
          </div>
        </div>

        {/* 開始位置 (順番通りの場合のみ) */}
        {order === 'SEQUENTIAL' && (
          <div className="pl-6 border-l-2 border-slate-200 dark:border-slate-700">
            <label className="block text-xs font-bold text-slate-400 mb-1">開始位置（0 = 最初から）</label>
            <input 
              type="number" 
              min={0} 
              max={totalCards - 1}
              value={startIndex}
              onChange={(e) => setStartIndex(Number(e.target.value))}
              className="w-full p-2 border rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600"
            />
            <p className="text-xs text-slate-400 mt-1">※前回の終了地点などを入力</p>
          </div>
        )}

        {/* 出題数 */}
        <div>
          <label className="block text-sm font-bold text-slate-500 mb-2">出題数 (対象: {totalCards}問)</label>
          <div className="flex flex-wrap gap-2">
            {[10, 20, 50].map(num => (
               <button
                 key={num}
                 onClick={() => setLimit(num)}
                 className={`px-4 py-2 rounded-full text-sm font-bold border transition
                   ${limit === num ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' : 'border-slate-300 hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-700'}`}
               >
                 {num}問
               </button>
            ))}
            <button
                 onClick={() => setLimit('ALL')}
                 className={`px-4 py-2 rounded-full text-sm font-bold border transition
                   ${limit === 'ALL' ? 'bg-slate-800 text-white dark:bg-white dark:text-slate-900' : 'border-slate-300 hover:bg-gray-100 dark:border-slate-600 dark:hover:bg-slate-700'}`}
               >
                 全問
               </button>
          </div>
        </div>

        <button 
          onClick={handleStart}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95 mt-4"
        >
          スタート
        </button>
      </div>
    </div>
  );
}

// --- 3. ゲーム画面 ---
function GameScreen({ cards, settings, onFinish, onBack }: { 
  cards: Card[], settings: GameSettings, onFinish: (res: GameResult[]) => void, onBack: () => void 
}) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [inputVal, setInputVal] = useState('');
  const [results, setResults] = useState<GameResult[]>([]);
  const [inputResult, setInputResult] = useState<'CORRECT' | 'WRONG' | null>(null); // 入力モード用の一時判定結果

  const currentCard = cards[index];
  const progress = ((index + 1) / cards.length) * 100;

  // 入力モード: 判定ロジック
  const checkInput = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputResult) return; // 判定済みなら何もしない

    const normalizedInput = normalizeString(inputVal);
    const normalizedAnswer = normalizeString(currentCard.answer);
    
    // 完全一致判定 (正規化後)
    // カンマ区切りの別解対応などもここで行うと良いが、今回は単純比較
    const isCorrect = normalizedInput === normalizedAnswer;
    
    setInputResult(isCorrect ? 'CORRECT' : 'WRONG');
    setShowAnswer(true);
  };

  // 次へ進む処理
  const goNext = (isCorrect: boolean) => {
    const newResult: GameResult = {
      cardId: currentCard.id,
      isCorrect: isCorrect,
      userAnswer: settings.mode === 'INPUT' ? inputVal : undefined
    };
    
    const nextResults = [...results, newResult];
    setResults(nextResults);

    if (index < cards.length - 1) {
      // 次の問題へ
      setIndex(prev => prev + 1);
      setShowAnswer(false);
      setInputVal('');
      setInputResult(null);
    } else {
      // 終了
      onFinish(nextResults);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col min-h-[80vh]">
      {/* プログレスバー */}
      <div className="w-full h-2 bg-gray-200 dark:bg-slate-700 rounded-full mb-6">
        <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg overflow-hidden flex flex-col flex-1">
        {/* カードヘッダー */}
        <div className="bg-slate-800 text-white p-4 flex justify-between items-center">
          <span className="font-mono text-sm opacity-80">ID: {currentCard.id}</span>
          <span className="font-bold">Q. {index + 1} / {cards.length}</span>
        </div>

        {/* 問題表示エリア */}
        <div className="p-8 flex-1 flex flex-col justify-center items-center text-center">
           <h3 className="text-sm text-slate-400 font-bold uppercase tracking-widest mb-4">Question</h3>
           <p className="text-2xl md:text-3xl font-bold leading-relaxed whitespace-pre-wrap">
             {currentCard.question}
           </p>
        </div>

        {/* 操作・解答エリア */}
        <div className="bg-slate-50 dark:bg-slate-900/50 p-6 border-t dark:border-slate-700">
          
          {/* --- 入力モード --- */}
          {settings.mode === 'INPUT' && (
            <div className="w-full max-w-lg mx-auto">
              {!showAnswer ? (
                <form onSubmit={checkInput} className="flex flex-col gap-4">
                  <input
                    type="text"
                    value={inputVal}
                    onChange={(e) => setInputVal(e.target.value)}
                    placeholder="答えを入力..."
                    className="w-full p-4 rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-lg focus:border-blue-500 outline-none transition"
                    autoFocus
                  />
                  <button 
                    type="submit" 
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition"
                  >
                    回答する
                  </button>
                </form>
              ) : (
                <div className="animate-in zoom-in-95 duration-200">
                  {/* 判定結果表示 */}
                  <div className={`text-center p-4 rounded-xl mb-4 ${inputResult === 'CORRECT' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                    <div className="text-2xl font-bold flex items-center justify-center gap-2">
                      {inputResult === 'CORRECT' ? <CheckCircle /> : <XCircle />}
                      {inputResult === 'CORRECT' ? '正解！' : '不正解...'}
                    </div>
                  </div>

                  <div className="mb-6 text-center">
                    <p className="text-xs text-slate-400 mb-1">正解</p>
                    <p className="text-xl font-bold text-slate-800 dark:text-slate-100">{currentCard.answer}</p>
                    {inputResult === 'WRONG' && (
                      <>
                        <p className="text-xs text-slate-400 mt-3 mb-1">あなたの回答</p>
                        <p className="text-lg text-slate-600 dark:text-slate-400 line-through">{inputVal}</p>
                      </>
                    )}
                  </div>

                  <button 
                    onClick={() => goNext(inputResult === 'CORRECT')}
                    className="w-full bg-slate-800 hover:bg-slate-700 text-white py-3 rounded-xl font-bold transition flex items-center justify-center gap-2"
                  >
                    次へ <ArrowLeft className="rotate-180 w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* --- 単語カードモード --- */}
          {settings.mode === 'FLASHCARD' && (
            <div className="w-full">
              {!showAnswer ? (
                <button 
                  onClick={() => setShowAnswer(true)}
                  className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-8 rounded-xl shadow-md transition text-xl"
                >
                  答えを表示
                </button>
              ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                   <div className="text-center mb-8">
                     <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Answer</h3>
                     <p className="text-2xl font-bold text-red-500 dark:text-red-400">{currentCard.answer}</p>
                   </div>
                   
                   <div className="grid grid-cols-2 gap-4">
                     <button 
                       onClick={() => goNext(false)}
                       className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-red-200 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-900 dark:text-red-400 transition"
                     >
                       <XCircle className="w-8 h-8 mb-2" />
                       <span className="font-bold">わからない</span>
                     </button>
                     <button 
                       onClick={() => goNext(true)}
                       className="flex flex-col items-center justify-center p-4 rounded-xl border-2 border-green-200 bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-900 dark:text-green-400 transition"
                     >
                       <CheckCircle className="w-8 h-8 mb-2" />
                       <span className="font-bold">わかった！</span>
                     </button>
                   </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
      
      <button onClick={onBack} className="mt-4 text-slate-400 hover:text-slate-600 text-sm underline self-center">
        中断してメニューに戻る
      </button>
    </div>
  );
}

// --- 4. 結果画面 ---
function ResultScreen({ results, allCards, onRetryWrong, onBackToMenu }: any) {
  const correctCount = results.filter((r: GameResult) => r.isCorrect).length;
  const wrongCount = results.length - correctCount;
  const score = Math.round((correctCount / results.length) * 100) || 0;

  return (
    <div className="flex flex-col items-center animate-in zoom-in-95 duration-500">
      <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
        <h2 className="text-2xl font-bold mb-6">結果発表</h2>
        
        <div className="relative w-40 h-40 mx-auto mb-6 flex items-center justify-center">
           <div className="absolute inset-0 rounded-full border-8 border-slate-100 dark:border-slate-700"></div>
           <div 
             className={`absolute inset-0 rounded-full border-8 ${score >= 80 ? 'border-green-500' : score >= 50 ? 'border-yellow-500' : 'border-red-500'} transition-all duration-1000`}
             style={{ clipPath: `inset(0 0 ${100 - score}% 0)` }} 
           ></div>
           <div className="z-10 flex flex-col">
             <span className="text-5xl font-bold">{score}</span>
             <span className="text-xs text-slate-400">POINT</span>
           </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg">
            <p className="text-xs text-green-600 dark:text-green-400 mb-1">正解</p>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{correctCount}問</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">不正解</p>
            <p className="text-xl font-bold text-red-700 dark:text-red-300">{wrongCount}問</p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {wrongCount > 0 && (
            <button 
              onClick={onRetryWrong}
              className="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold shadow-lg transition"
            >
              間違えた問題のみ復習 ({wrongCount}問)
            </button>
          )}
          <button 
            onClick={onBackToMenu}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white py-3 rounded-xl font-bold shadow transition"
          >
            メニューに戻る
          </button>
        </div>
      </div>
    </div>
  );
}

// --- 5. 苦手リスト画面 ---
function WrongListScreen({ allCards, wrongHistory, onBack, onStartReview }: any) {
  const wrongCards = allCards.filter((c: Card) => wrongHistory[c.id] > 0);
  
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg min-h-[80vh] flex flex-col animate-in slide-in-from-right-4 duration-300">
      <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center sticky top-0 bg-white dark:bg-slate-800 z-10 rounded-t-xl">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold">苦手リスト</h2>
        </div>
        {wrongCards.length > 0 && (
           <button 
             onClick={onStartReview}
             className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow"
           >
             まとめて復習
           </button>
        )}
      </div>

      <div className="p-4 overflow-y-auto flex-1">
        {wrongCards.length === 0 ? (
           <div className="h-full flex flex-col items-center justify-center text-slate-400">
             <CheckCircle className="w-12 h-12 mb-2 text-green-300" />
             <p>苦手な単語はありません！</p>
           </div>
        ) : (
          <div className="space-y-3">
            {wrongCards.map((card: Card) => (
              <div key={card.id} className="flex items-start gap-3 p-3 border dark:border-slate-700 rounded-lg bg-gray-50 dark:bg-slate-900/50">
                <div className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-1 rounded text-xs font-bold h-fit whitespace-nowrap">
                  ミス: {wrongHistory[card.id]}回
                </div>
                <div className="flex-1">
                  <p className="font-bold text-sm mb-1">{card.question}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{card.answer}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}