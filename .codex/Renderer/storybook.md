# Storybook Notes

Storybook은 실제 IPC/Store 로직 연결 전 UI를 확인하는 공간으로 사용한다. View와 Component는 story에서 mock props만으로 렌더링 가능해야 한다.

## 주요 Story

### MainView

`src/Renderer/View/MainView/MainView.stories.tsx`

- `LauncherShell`: sidebar navigation 클릭으로 dashboard, logs, preferences 전환을 확인한다.
- log entries, sessions, sources mock data를 포함한다.
- 실제 Main process 없이 전체 shell의 시각 구조를 확인한다.

### LogViewer

`src/Renderer/Component/LogViewer.stories.tsx`

- session 선택, category/source/level/text filter를 확인한다.
- app/wine category mock 로그를 포함한다.
- textarea 기반 출력이 복사하기 쉬운지 확인한다.

### PreferenceView

`src/Renderer/View/PreferenceView/PreferenceView.stories.tsx`

- `Default`: 일반 설정 카테고리.
- `WineSettings`: Wine 카테고리와 하단 save bar 표시.
- `ShortcutSettings`: 단축키 카테고리.

### SplashView

`src/Renderer/View/SplashView/SplashPage.stories.tsx`

- `Default`: 기본 progress.
- `AlmostReady`: 거의 완료 상태.
- `FillAndStop`: 0에서 100까지 차오르고 멈추는 animation 확인.

### Terminal

`src/Renderer/Component/Terminal.stories.tsx`

- XTerm surface 렌더링 확인.
- 실제 shell 연결은 없다.

## Storybook 작성 규칙

- `App.tsx`보다 View/Component 본체를 story에 올린다.
- IPC, Electron API, Zustand store 없이 mock data로 동작해야 한다.
- UI 상태가 여러 개면 story를 나눠서 추가한다.
- 실제 런타임 진행 로직이 아닌 시각적 애니메이션은 story 내부 state로 구현한다.

## 검증 명령

```bash
pnpm build-storybook
```

Renderer 타입 검증:

```bash
pnpm exec tsc -p src/Renderer/tsconfig.json --noEmit
```
