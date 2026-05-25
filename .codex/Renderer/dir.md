# Renderer Directory Guide

Renderer를 구현할 때는 `src/Common`, `src/Preload`의 타입과 IPC API를 먼저 확인한다.
Renderer는 Electron main process와 직접 결합하지 않고, preload가 expose한 API와 공통 타입을 통해 데이터를 받는다.

## Directory 구조

```text
Renderer/
    Common/
        Renderer 전역에서 사용하는 helper, prototype props, interface.

    Component/
        여러 View에서 재사용하는 UI 컴포넌트.
        View 전용 상태나 IPC 호출을 직접 가지지 않는다.

    Store/
        Zustand 기반 data/store 계층.
        preload expose API 호출, IPC 구독, View에서 공유되는 상태를 관리한다.

    I18n/
        Renderer locale 리소스와 i18next 초기화.
        UI 문자열은 가능한 이 디렉터리의 translation key를 통해 관리한다.

    style/
        Tailwind/PostCSS 기반 전역 스타일.

    Template/
        webpack html plugin용 HTML template.

    View/
        Main process에서 로드될 View/Page 구현체.
        최소 화면 크기는 800 x 600 px 기준으로 고려한다.
```

## 역할 구분

### App.tsx

`App.tsx`는 View와 data를 연결하는 container로 본다.

- store selector, IPC callback, `useEffect`, lifecycle timer 등 연결 로직을 담당한다.
- 화면의 큰 조립과 시각적 구조는 별도 View 컴포넌트로 넘긴다.
- Storybook 예시는 `App.tsx`를 직접 보여주지 않는다.

예시:

```text
MainView/App.tsx
    useSystemStore()
    preload IPC action 연결
    Splash 표시 여부 결정
    LauncherView에 props 전달
```

### View

View는 화면 단위 UI다. 가능하면 data를 props로 받고, 직접 IPC나 store에 의존하지 않는다.

현재 구조:

```text
View/MainView/
    App.tsx
        MainView container.
    MainView.tsx
        LauncherView, DashboardView 등 실제 화면 구성.
    MainView.stories.tsx
        DashboardView, LauncherView Storybook 예시.

View/PreferenceView/
    App.tsx
        PreferenceView container.
    PreferenceView.tsx
        설정 화면 본체.
    PreferenceView.stories.tsx

View/SplashView/
    App.tsx
        SplashView container.
    SplashPage.tsx
        Splash 화면 본체.
    SplashPage.stories.tsx

View/TerminalView/
    App.tsx
        Terminal 단독 실행용 container.
```

### Component

Component는 여러 View에서 공통으로 사용할 수 있게 만든다.
특정 View의 business data 구조에 강하게 묶이면 Component가 아니라 View 내부로 둔다.

현재 주요 컴포넌트:

```text
Component/MainFrame.tsx
    앱 shell, sidebar, header, content frame.

Component/ImageButton.tsx
    게임/앱 tile 버튼.

Component/InstalledWinePanel.tsx
    설치 완료 또는 설치 중인 Wine만 모아 보여주는 패널.
    MainView 기본 화면에는 Wine 리스트를 직접 노출하지 않고, 사용자가 설치 Wine 보기를 열 때 사용한다.

Component/MacTitleBar.tsx
    macOS frameless window용 custom titlebar.
    좌측 traffic light 위치에 quit, minimize, maximize 액션을 둔다.

Component/ProgressBar.tsx
    진행률 표시.

Component/SelectMenu.tsx
    버튼을 누르면 선택 목록이 펼쳐지는 dropdown/select menu.
    언어, accent color처럼 제한된 옵션 중 하나를 고르는 설정 UI에 사용한다.

Component/StatusBadge.tsx
    status label/tone 표시.

Component/Terminal.tsx
    XTerm 기반 터미널 surface.

Component/WineVersionCard.tsx
    Wine 버전 카드.

Component/WindowControls.tsx
    custom titlebar/window action controls.
    macOS native traffic light 버튼을 숨기는 경우 MainView 상단에서 앱 종료/갱신 액션을 제공한다.
```

`ImangeButton.tsx`는 기존 오타 import 호환을 위한 wrapper로 유지한다.
새 코드는 `ImageButton.tsx`, `ProgressBar.tsx`를 import한다.

### Store

Store는 View가 필요로 하는 serializable data를 관리한다.

```text
Store/UseSystemStore.ts
    Wine catalog, 선택된 Wine, 설치 경로, IPC 상태 구독.

Store/UseTerminalStore.ts
    터미널 로그 상태.
```

Store에서 preload API를 호출하고, View는 action과 data를 props로 받는 방향을 우선한다.

### Theme

Renderer theme 상태와 DOM 적용 로직은 `Theme/` 아래에 둔다.

```text
Theme/AccentColor.ts
    accent color 목록, localStorage 복원, document dataset 적용.

Theme/index.ts
    public export.
```

accent color는 `data-accent-color`와 CSS variable을 통해 적용한다.
의미가 고정된 상태 색상(success, warning, error)이나 앱 종료 같은 destructive action 색상은 accent color와 분리한다.

### I18n

Renderer는 `i18next` + `react-i18next`를 사용한다.

```text
I18n/I18n.ts
    i18next 초기화, locale 감지, localStorage 저장, locale 변경 helper.

I18n/Resources.ts
    ko/en translation resource.

I18n/index.ts
    public export.
```

규칙:

- 새 UI 문자열은 View/Component에 직접 박지 말고 translation key로 추가한다.
- View/Component에서는 `useTranslation()`을 사용한다.
- App container에서 locale 변경을 연결한다.
- PreferenceView에는 locale 선택 UI와 accent color 선택 UI를 둔다.
- Storybook preview는 global toolbar로 locale과 accent color를 전환할 수 있어야 한다.
- 비즈니스 데이터 자체가 사용자 입력 또는 외부 catalog 값이면 번역하지 않는다. 예: 게임 이름, Wine build 이름.

## Storybook 규칙

Storybook은 `App.tsx`가 아니라 App 안에서 쓰는 View/Component 본체를 보여준다.

- Component는 각각 `ComponentName.stories.tsx`를 둔다.
- View 계열은 `ViewName.stories.tsx`를 둔다.
- View story는 mock data를 props로 주입한다.
- IPC, Zustand, Electron API에 의존하지 않는 상태로 렌더링 가능해야 한다.
- App container의 동작을 보여줄 필요가 있으면, App이 아니라 `LauncherView`처럼 화면 조립 컴포넌트를 story로 만든다.
- locale 동작은 Storybook toolbar에서 확인한다.

현재 Storybook 대상:

```text
Component/ImageButton.stories.tsx
Component/InstalledWinePanel.stories.tsx
Component/MacTitleBar.stories.tsx
Component/MainFrame.stories.tsx
Component/ProgressBar.stories.tsx
Component/SelectMenu.stories.tsx
Component/StatusBadge.stories.tsx
Component/Terminal.stories.tsx
Component/WineVersionCard.stories.tsx
Component/WindowControls.stories.tsx

View/MainView/MainView.stories.tsx
View/PreferenceView/PreferenceView.stories.tsx
View/SplashView/SplashPage.stories.tsx
```

## View별 메모

### MainView

런처의 기본 화면이다.

- `LauncherView`: `MainFrame` 안에 dashboard, terminal, preferences를 조립한다.
- `DashboardView`: 게임 라이브러리, 선택된 Wine, Wine catalog 상태를 보여준다.
- Wine 버전 리스트는 기본 dashboard에 직접 노출하지 않는다.
  설치된 Wine 목록은 `설치 Wine 보기` 액션으로 `InstalledWinePanel`을 열어 확인한다.
- App container는 store/IPC와 `LauncherView` props 연결만 담당한다.

### PreferenceView

설정 화면이다.

- General에는 locale과 accent color를 둔다.
- locale과 accent color처럼 정해진 값 중 하나를 고르는 UI는 `SelectMenu`를 사용한다.
- 설치 경로, 실행 옵션, 터미널 관련 설정을 다룬다.
- 값 저장/로드는 Main process 설정과 연결될 수 있으므로 store 또는 preload API 경유를 우선한다.

### SplashView

초기 로딩 화면이다.

- metadata, catalog, preload 준비 상태를 보여준다.
- 단독 App에서도 쓸 수 있고 MainView container에서도 초기 상태로 사용한다.

### TerminalView

터미널 단독 View다.

- 현재는 XTerm surface를 보여준다.
- Wine stdout/stderr, install log, debug command bridge와 연결될 수 있다.

## View Life Cycle

```text
SplashView
    -> metadata/catalog/preload API 준비
    -> MainView
        -> DashboardView
        -> PreferenceView
        -> TerminalView
        -> UpdateView (추가 예정)
```
