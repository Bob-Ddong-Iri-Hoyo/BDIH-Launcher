# Main Managers

`src/Main/Manager` 아래에 Main process 기능을 Manager 단위로 나눴다. 목표는 `Main.ts`가 모든 세부 구현을 직접 들고 있지 않게 하고, 창/IPC/Wine/업데이트/로그/설정 같은 책임을 독립적으로 관리하는 것이다.

## 초기화 흐름

`src/Main/Main.ts`의 기본 방향:

1. `logManager.init()`을 가장 먼저 실행한다.
2. 단일 인스턴스 lock을 획득한 주 인스턴스만 `GuardianManager`를 시작하고 이전 비정상 종료에서 남은 Wine을 복구한다.
3. `ipcManager.init()`으로 IPC handler를 등록한다.
4. `windowManager`로 splash/main window를 생성하고 view를 로드한다.
5. `preferenceManager`, `shortcutManager`, `updateManager` 같은 앱 레벨 기능을 연결한다.

로그가 가장 먼저 초기화되는 이유는 창 생성, IPC 등록, 업데이트 체크 중 발생하는 예외를 초기부터 파일에 남기기 위해서다.

## Manager 목록

| File | 역할 |
| --- | --- |
| `WindowManager.ts` | Electron `BrowserWindow` 생성, view 로딩, window action 처리 |
| `IPCManager.ts` | Renderer/Preload에서 호출하는 IPC handler 통합 등록 |
| `WineManager.ts` | Wine catalog 조회, Wine 설치 요청, Wine 관련 작업 로그 연결 |
| `DownloadManager.ts` | 다운로드 작업의 실행 단위 관리 |
| `ProcessManager.ts` | 외부 child process 실행을 Manager 레이어에서 감싸는 역할 |
| `WineProcessMonitor.ts` | BDIH Wine의 Prefix별 FIFO process telemetry를 검증·추적하고 현재 process snapshot을 제공 |
| `HoyoPlayProxyManager.ts` | HoYoPlay game proxy와 실제 game process를 telemetry로 연결하고 동일 Bottle/game 중복 route를 차단 |
| `GuardianManager.ts` | 일반 ProcessManager와 분리된 C Guardian 생명주기를 관리하고 비정상 종료 시 BDIH 경로의 고아 Wine 정리를 보장 |
| `UpdateManager.ts` | `electron-updater` 기반 앱 업데이트 상태 확인 및 이벤트 관리 |
| `PreferenceManager.ts` | 설정 파일 로드/저장, 기본 설정 제공 |
| `ShortcutManager.ts` | 앱 단축키 등록/해제 진입점 |
| `PluginManager.ts` | 향후 플러그인 로드/수명주기 관리 진입점 |
| `LogManager.ts` | console/file log 초기화, session log 생성, logger factory 제공 |
| `index.ts` | Manager public export |

## 설계 메모

- Manager들은 singleton instance를 export해서 Main process에서 공유한다.
- `GuardianManager`는 `ProcessManager`에 등록하지 않는다. Guardian은 Electron Main보다 오래 살아야 하는 비정상 종료 전용 네이티브 자식 프로세스다.
- 큰 기능은 Manager로 옮기되, 실제 UI 상태는 Renderer Store 또는 View props로 유지한다.
- Manager 간 직접 참조는 필요한 경우만 허용한다. 예를 들어 `WineManager`는 `LogManager` logger를 사용한다.
- `Handler.ts`는 직접 IPC를 등록하지 않고 `ipcManager.init()`으로 위임한다.

## 다음 작업 후보

- `ProcessManager`와 `DownloadManager`를 Wine 설치 flow에 더 깊게 연결한다.
- `PreferenceManager`의 schema를 명확히 하고 Renderer PreferenceView와 실제 저장 IPC를 연결한다.
- `ShortcutManager`에 Renderer 단축키 설정과 충돌 검사 로직을 추가한다.
