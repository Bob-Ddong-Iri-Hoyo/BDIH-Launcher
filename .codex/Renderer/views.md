# Renderer Views

Renderer는 `View/*/App.tsx`를 container로, 실제 화면은 View 컴포넌트로 나누는 방향이다. Store/IPC/lifecycle은 App 또는 Store가 담당하고, View는 props 기반으로 렌더링하는 것을 우선한다.

## MainView

주요 파일:

- `src/Renderer/View/MainView/MainView.tsx`
- `src/Renderer/View/MainView/App.tsx`
- `src/Renderer/View/MainView/MainView.stories.tsx`

구성:

- `MainFrame`을 shell로 사용한다.
- sidebar navigation에 dashboard, logs, preferences가 있다.
- Dashboard 안에는 Wine catalog, bottle/game list, installed Wine panel이 있다.
- Logs 선택 시 `LogViewer`를 렌더링한다.
- Terminal은 MainView navigation에서 제외했고, 추후 bottle별 작업 화면에서 직접 열리는 방향으로 둔다.
- Preferences 선택 시 `PreferenceView`를 렌더링한다.

Storybook의 `LauncherShell`은 sidebar 클릭으로 view 전환이 가능하게 구성했다.

## PreferenceView

주요 파일:

- `src/Renderer/View/PreferenceView/PreferenceView.tsx`
- `src/Renderer/View/PreferenceView/App.tsx`
- `src/Renderer/View/PreferenceView/PreferenceView.stories.tsx`

구성:

- 설정 카테고리는 상단 가로 버튼으로 전환한다.
- 카테고리는 `일반`, `Wine`, `단축키`로 나눈다.
- 카테고리 버튼이 많아지면 상단 영역에 horizontal scroll이 생긴다.
- 변경사항이 생기면 하단 fixed save bar가 올라온다.
- 일반 카테고리는 locale과 accent color를 다룬다.
- Wine 카테고리는 install path와 launch option을 다룬다.
- 단축키 카테고리는 주요 화면/실행 shortcut preview를 보여준다.

실제 저장 로직은 아직 UI hook만 열어둔 상태이며, `onSave`, `onInstallPathChange`, `onLocaleChange`, `onAccentColorChange`로 연결한다.

## SplashView

주요 파일:

- `src/Renderer/View/SplashView/SplashPage.tsx`
- `src/Renderer/View/SplashView/App.tsx`
- `src/Renderer/View/SplashView/SplashPage.stories.tsx`

구성:

- wide logo 이미지를 메인 비주얼로 사용한다.
- 이미지 하단에 gradient overlay를 깔고 앱 이름, 설명, progress를 겹쳐 보여준다.
- 앱 이름 텍스트에는 progress에 따라 아래에서 위로 물이 차오르는 듯한 clip-path layer를 얹었다.
- progress bar는 overlay 내부에서 얇고 빛나는 형태로 표시한다.

Storybook:

- `Default`: 기본 progress 상태.
- `AlmostReady`: 92% 상태.
- `FillAndStop`: 0%에서 100%까지 차오른 뒤 `Ready.`로 멈추는 Storybook 전용 애니메이션.

## TerminalView

주요 파일:

- `src/Renderer/View/TerminalView/App.tsx`
- `src/Renderer/Component/Terminal.tsx`

구성:

- `@xterm/xterm`과 `@xterm/addon-fit`을 사용한다.
- Storybook 환경에서 `FitAddon` 초기화 타이밍 문제로 `scrollBarWidth` undefined가 나던 문제를 safe fit wrapper와 frame 지연으로 완화했다.
- 현재는 UI surface와 mock welcome 중심이며, 실제 shell 조작은 `node-pty + IPC` 작업이 필요하다.
