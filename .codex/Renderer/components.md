# Renderer Components

Renderer 공용 컴포넌트는 View에 직접 종속되지 않도록 작성한다. 데이터는 props로 받고, IPC나 Store 호출은 가능한 View/App/Store에서 처리한다.

## MainFrame

`src/Renderer/Component/MainFrame.tsx`

- 앱 전체 shell, sidebar, header, content frame을 담당한다.
- navigation key에 `logs`를 추가했다.
- sidebar가 이미 있기 때문에 LogViewer 내부에는 별도 sidebar를 두지 않는 방향으로 정리했다.

## LogViewer

`src/Renderer/Component/LogViewer.tsx`

구성:

- `LogSessionList`: 상단 날짜/session 목록.
- `LogFilterBar`: text filter, category, source, level filter.
- `LogTextPanel`: 복사하기 쉬운 read-only textarea 출력.

로그 category:

- `all`
- `app`
- `wine`

UI 방향:

- 왼쪽 sidebar 대신 상단 session list를 사용한다.
- 실제 파일은 `app.log`, `wine.log`로 나누되, 화면에서는 선택된 session의 로그를 병합해서 보여줄 수 있게 한다.
- 대량 로그를 오래 들고 있지 않도록, 추후 IPC pagination/tail과 연결하는 것을 전제로 한다.

## Terminal

`src/Renderer/Component/Terminal.tsx`

- XTerm 기반 terminal surface.
- `@xterm/addon-fit` 사용.
- Storybook에서 mount 직후 container 크기가 아직 안정화되지 않은 경우를 피하기 위해 safe fit 처리.
- 실제 terminal 조작은 아직 연결 전이다.

## Preference 관련 컴포넌트

`PreferenceView` 내부에 설정 카테고리/섹션/필드 구조가 있다.

- `SettingField`: title, description, input slot.
- `PreferenceSection`: 설정 section frame.
- 상단 카테고리 버튼은 icon + label + description 구조.
- 변경 상태가 생기면 fixed save bar가 하단에서 transition으로 올라온다.

## Splash 관련 UI

`SplashPage.tsx` 내부에 image overlay와 progress title effect를 직접 구현했다.

- CSS `clip-path`로 제목의 fill layer를 progress에 맞춰 자른다.
- 하이라이트 line은 progress 위치에 맞춰 `bottom: ${progress}%`로 움직인다.
- Storybook 애니메이션은 View logic이 아니라 story에서만 제어한다.

## 보조 컴포넌트

| File | 역할 |
| --- | --- |
| `InstalledWinePanel.tsx` | 설치 완료/진행 중 Wine만 모아 보여주는 dashboard panel |
| `MacTitleBar.tsx` | frameless macOS 스타일 titlebar |
| `WindowControls.tsx` | refresh/minimize/maximize/quit window action buttons |
| `SelectMenu.tsx` | locale/accent color처럼 제한된 옵션 선택 UI |
| `StatusBadge.tsx` | 상태 label과 tone 표시 |
| `ProgressBar.tsx` | 일반 progress 표시 |
| `WineVersionCard.tsx` | Wine version item card |
| `ImageButton.tsx` | library tile/button |

## 호환 wrapper

- `ImangeButton.tsx`

기존 오타 import 호환용 wrapper다. 새 코드에서는 가능한 `ImageButton.tsx`, `ProgressBar.tsx`를 직접 import한다.
