# Logging Strategy

로그는 Main process에서 `LogManager`가 가장 먼저 초기화되도록 구성했다. 목적은 앱 초기화, window 생성, IPC 등록, Wine 다운로드/설치, 예외를 놓치지 않고 파일에 남기는 것이다.

## 파일 구조

현재 방향:

```text
<electron logs path>/
    <YYYY-MM-DD_HHmmss>/
        app.log
        wine.log
        guardian.log
        app.log.1
        wine.log.1
```

세션마다 폴더를 만들고, 일반 실행 로그는 큰 범주인 `app`, `wine`으로
나눈다. `guardian.log`는 Main process가 이미 사라진 뒤에도 마지막
cleanup 결과를 남겨야 하므로 네이티브 Guardian이 직접 기록하는 예외다.

| 파일 | 내용 |
| --- | --- |
| `app.log` | 앱 초기화, window, IPC, preference, update, renderer 연결, 일반 console log |
| `wine.log` | Wine catalog/install, 다운로드, curl, Wine 실행 관련 stdout/stderr |
| `guardian.log` | Guardian 준비/종료 원인, 발견·강제 종료·잔존 Wine PID 수, cleanup 결과 |

너무 세분화된 파일을 만들지 않는 이유는 사용자가 문제를 볼 때 `app`과
`wine` 정도의 큰 경계가 가장 이해하기 쉽고, 파일 수가 과도하게 늘어나는
것을 피하기 위해서다. `guardian.log`는 session별 append-only 소형
진단 로그이며 Main logger나 log rotation에 의존하지 않는다.

## Logger 사용 방식

`LogManager`는 두 방식의 logger를 제공한다.

```ts
logManager.createLogger("WindowManager");
logManager.createLogger({ file: "wine", source: "download" });
```

- 문자열 scope는 기본적으로 `app.log`에 기록한다.
- `{ file: "wine", source: "..." }`는 `wine.log`에 기록한다.
- `WineManager`는 `source: "wine"`, `Curl`은 `source: "download"`로 기록한다.

## Console / 예외 처리

- `console.log`, `console.info`, `console.warn`, `console.error`를 patch해서 `app.log`에도 남긴다.
- `process.uncaughtException`, `process.unhandledRejection`도 `app.log`에 남긴다.
- 원래 console 출력은 유지해서 개발 중 터미널에서도 확인 가능하다.

## Rotation

기본 방향:

- 파일 하나가 일정 크기를 넘으면 `.1`, `.2` 식으로 rotate한다.
- 현재 기본값은 작은 앱 로그에 맞춘 제한이며, 대량 Wine 로그는 추후 조정 가능하다.

## Renderer LogViewer와의 관계

파일 로그는 영구 보관용이고, Renderer의 `LogViewer`는 표시용이다. 대량 로그를 모두 메모리에 올리는 방식은 장기적으로 위험하므로 다음 방향을 권장한다.

- Renderer는 현재 화면에 필요한 slice만 유지한다.
- Main process가 파일을 읽어 page 단위로 전달한다.
- 실시간 로그는 ring buffer로 최근 N줄만 Store에 유지한다.
- 날짜별 session 목록은 파일 시스템에서 scan해서 보여준다.

## 다음 작업 후보

- `log:listSessions`, `log:read`, `log:tail` IPC 추가.
- `app.log`, `wine.log`를 병합해서 시간순으로 stream하는 reader 구현.
- Renderer는 가상 스크롤 또는 textarea chunk append 방식으로 대량 로그를 처리한다.
