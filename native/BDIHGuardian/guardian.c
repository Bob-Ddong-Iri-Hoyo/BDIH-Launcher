#define _DARWIN_C_SOURCE 1
#define _POSIX_C_SOURCE 200809L

#include <ctype.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <signal.h>
#include <stdbool.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/event.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#define MAX_MANAGED_ROOTS 64
#define CONTROL_LINE_CAPACITY 64
#define GRACEFUL_WAIT_MS 500
#define FORCED_WAIT_MS 200

typedef struct {
    char *items[MAX_MANAGED_ROOTS];
    size_t count;
} root_list;

typedef struct {
    pid_t *items;
    size_t count;
    size_t capacity;
} pid_list;

typedef enum {
    GUARDIAN_TRIGGER_CLEAN,
    GUARDIAN_TRIGGER_CONTROL_EOF,
    GUARDIAN_TRIGGER_OWNER_EXIT,
    GUARDIAN_TRIGGER_SIGNAL_HUP,
    GUARDIAN_TRIGGER_SIGNAL_TERM,
    GUARDIAN_TRIGGER_SIGNAL_INT,
    GUARDIAN_TRIGGER_MONITOR_ERROR,
} guardian_trigger;

typedef struct {
    int queue_fd;
    bool owner_exited;
} guardian_monitor;

typedef struct {
    char line[CONTROL_LINE_CAPACITY];
    size_t line_length;
    bool clean_shutdown;
} control_parser;

typedef struct {
    size_t detected;
    size_t forced;
    size_t remaining;
    int result;
} cleanup_result;

static volatile sig_atomic_t termination_signal = 0;

static void record_termination_signal(int signal_number) {
    if (termination_signal == 0) {
        termination_signal = signal_number;
    }
}

static bool install_termination_signal_handlers(void) {
    struct sigaction action;
    memset(&action, 0, sizeof(action));
    action.sa_handler = record_termination_signal;
    sigemptyset(&action.sa_mask);

    return sigaction(SIGHUP, &action, NULL) == 0
        && sigaction(SIGTERM, &action, NULL) == 0
        && sigaction(SIGINT, &action, NULL) == 0;
}

static guardian_trigger trigger_for_signal(int signal_number) {
    switch (signal_number) {
        case SIGHUP:
            return GUARDIAN_TRIGGER_SIGNAL_HUP;
        case SIGTERM:
            return GUARDIAN_TRIGGER_SIGNAL_TERM;
        case SIGINT:
            return GUARDIAN_TRIGGER_SIGNAL_INT;
        default:
            return GUARDIAN_TRIGGER_MONITOR_ERROR;
    }
}

static const char *trigger_name(guardian_trigger trigger) {
    switch (trigger) {
        case GUARDIAN_TRIGGER_CLEAN:
            return "clean";
        case GUARDIAN_TRIGGER_CONTROL_EOF:
            return "control-eof";
        case GUARDIAN_TRIGGER_OWNER_EXIT:
            return "owner-exit";
        case GUARDIAN_TRIGGER_SIGNAL_HUP:
            return "signal-hup";
        case GUARDIAN_TRIGGER_SIGNAL_TERM:
            return "signal-term";
        case GUARDIAN_TRIGGER_SIGNAL_INT:
            return "signal-int";
        case GUARDIAN_TRIGGER_MONITOR_ERROR:
            return "monitor-error";
    }

    return "unknown";
}

static void write_guardian_event(int event_log_fd, const char *event) {
    if (event_log_fd < 0) {
        return;
    }

    struct timespec timestamp;
    if (clock_gettime(CLOCK_REALTIME, &timestamp) != 0) {
        timestamp.tv_sec = 0;
        timestamp.tv_nsec = 0;
    }
    dprintf(
        event_log_fd,
        "%lld.%03ld pid=%d %s\n",
        (long long)timestamp.tv_sec,
        timestamp.tv_nsec / 1000000L,
        getpid(),
        event
    );
}

static int open_event_log(const char *event_log_path) {
    if (event_log_path == NULL || event_log_path[0] == '\0') {
        return -1;
    }

    return open(
        event_log_path,
        O_WRONLY | O_CREAT | O_APPEND | O_CLOEXEC | O_NOFOLLOW,
        0600
    );
}

static void free_roots(root_list *roots) {
    for (size_t index = 0; index < roots->count; index += 1) {
        free(roots->items[index]);
    }
    roots->count = 0;
}

static void free_pids(pid_list *pids) {
    free(pids->items);
    pids->items = NULL;
    pids->count = 0;
    pids->capacity = 0;
}

static bool pid_list_contains(const pid_list *pids, pid_t pid) {
    for (size_t index = 0; index < pids->count; index += 1) {
        if (pids->items[index] == pid) {
            return true;
        }
    }
    return false;
}

static bool pid_list_append(pid_list *pids, pid_t pid) {
    if (pid <= 1 || pid_list_contains(pids, pid)) {
        return true;
    }

    if (pids->count == pids->capacity) {
        const size_t next_capacity = pids->capacity == 0 ? 16 : pids->capacity * 2;
        pid_t *next_items = realloc(pids->items, next_capacity * sizeof(pid_t));
        if (next_items == NULL) {
            return false;
        }
        pids->items = next_items;
        pids->capacity = next_capacity;
    }

    pids->items[pids->count] = pid;
    pids->count += 1;
    return true;
}

static char *normalize_root(const char *value) {
    char resolved[PATH_MAX];
    char *root = realpath(value, resolved) != NULL ? strdup(resolved) : strdup(value);
    if (root == NULL) {
        return NULL;
    }

    size_t length = strlen(root);
    while (length > 1 && root[length - 1] == '/') {
        root[length - 1] = '\0';
        length -= 1;
    }
    return root;
}

static bool path_is_within_root(const char *candidate, const char *root) {
    const size_t root_length = strlen(root);
    if (strncmp(candidate, root, root_length) != 0) {
        return false;
    }

    return candidate[root_length] == '\0'
        || (root_length == 1 && root[0] == '/')
        || candidate[root_length] == '/';
}

static bool path_is_managed(const char *candidate, const root_list *roots) {
    for (size_t index = 0; index < roots->count; index += 1) {
        if (path_is_within_root(candidate, roots->items[index])) {
            return true;
        }
    }
    return false;
}

static const char *path_basename(const char *value) {
    const char *slash = strrchr(value, '/');
    const char *backslash = strrchr(value, '\\');
    const char *separator = slash;

    if (backslash != NULL && (separator == NULL || backslash > separator)) {
        separator = backslash;
    }
    return separator == NULL ? value : separator + 1;
}

static bool is_wine_executable_name(const char *name) {
    return strcmp(name, "wine") == 0
        || strcmp(name, "wine64") == 0
        || strcmp(name, "wine-preloader") == 0
        || strcmp(name, "wine64-preloader") == 0
        || strcmp(name, "wineserver") == 0
        || strcmp(name, "wineboot") == 0;
}

static bool is_wine_host_command(const char *command) {
    while (isspace((unsigned char)*command)) {
        command += 1;
    }

    if (isalpha((unsigned char)command[0])
        && command[1] == ':'
        && (command[2] == '\\' || command[2] == '/')) {
        return true;
    }

    char executable[PATH_MAX];
    size_t length = 0;
    while (command[length] != '\0'
        && !isspace((unsigned char)command[length])
        && length + 1 < sizeof(executable)) {
        executable[length] = command[length];
        length += 1;
    }
    executable[length] = '\0';

    return is_wine_executable_name(path_basename(executable));
}

static pid_list discover_wine_candidates(pid_t owner_pid) {
    pid_list candidates = {0};
    FILE *stream = popen("/bin/ps -axo pid=,command=", "r");
    if (stream == NULL) {
        return candidates;
    }

    char *line = NULL;
    size_t capacity = 0;
    const pid_t guardian_pid = getpid();

    while (getline(&line, &capacity, stream) >= 0) {
        char *cursor = line;
        while (isspace((unsigned char)*cursor)) {
            cursor += 1;
        }

        errno = 0;
        char *pid_end = NULL;
        const long parsed_pid = strtol(cursor, &pid_end, 10);
        if (errno != 0 || pid_end == cursor || parsed_pid <= 1 || parsed_pid > INT_MAX) {
            continue;
        }

        while (isspace((unsigned char)*pid_end)) {
            pid_end += 1;
        }

        const pid_t pid = (pid_t)parsed_pid;
        if (pid == guardian_pid || pid == owner_pid || !is_wine_host_command(pid_end)) {
            continue;
        }

        if (!pid_list_append(&candidates, pid)) {
            break;
        }
    }

    free(line);
    pclose(stream);
    return candidates;
}

static char *build_lsof_command(const pid_list *candidates) {
    const size_t base_capacity = 128;
    const size_t pid_capacity = candidates->count * 16;
    char *command = calloc(base_capacity + pid_capacity, 1);
    if (command == NULL) {
        return NULL;
    }

    size_t offset = (size_t)snprintf(
        command,
        base_capacity + pid_capacity,
        "/usr/sbin/lsof -n -Fpn -a -p "
    );
    for (size_t index = 0; index < candidates->count; index += 1) {
        offset += (size_t)snprintf(
            command + offset,
            base_capacity + pid_capacity - offset,
            "%s%d",
            index == 0 ? "" : ",",
            candidates->items[index]
        );
    }
    snprintf(
        command + offset,
        base_capacity + pid_capacity - offset,
        " -d cwd,txt 2>/dev/null"
    );
    return command;
}

static pid_list discover_managed_wine_processes(
    const root_list *roots,
    pid_t owner_pid
) {
    pid_list managed = {0};
    pid_list candidates = discover_wine_candidates(owner_pid);
    if (candidates.count == 0) {
        free_pids(&candidates);
        return managed;
    }

    char *command = build_lsof_command(&candidates);
    if (command == NULL) {
        free_pids(&candidates);
        return managed;
    }

    FILE *stream = popen(command, "r");
    free(command);
    if (stream == NULL) {
        free_pids(&candidates);
        return managed;
    }

    char *line = NULL;
    size_t capacity = 0;
    pid_t current_pid = 0;

    while (getline(&line, &capacity, stream) >= 0) {
        if (line[0] == 'p') {
            errno = 0;
            char *pid_end = NULL;
            const long parsed_pid = strtol(line + 1, &pid_end, 10);
            current_pid = errno == 0
                && pid_end != line + 1
                && parsed_pid > 1
                && parsed_pid <= INT_MAX
                ? (pid_t)parsed_pid
                : 0;
            continue;
        }

        if (current_pid == 0 || line[0] != 'n') {
            continue;
        }

        char *process_path = line + 1;
        process_path[strcspn(process_path, "\r\n")] = '\0';
        if (path_is_managed(process_path, roots)
            && !pid_list_append(&managed, current_pid)) {
            break;
        }
    }

    free(line);
    pclose(stream);
    free_pids(&candidates);
    return managed;
}

static void signal_processes(const pid_list *pids, int signal_number) {
    for (size_t index = 0; index < pids->count; index += 1) {
        if (kill(pids->items[index], signal_number) != 0 && errno != ESRCH) {
            dprintf(
                STDERR_FILENO,
                "failed to signal pid %d: %s\n",
                pids->items[index],
                strerror(errno)
            );
        }
    }
}

static void wait_milliseconds(long milliseconds) {
    struct timespec duration = {
        .tv_sec = milliseconds / 1000,
        .tv_nsec = (milliseconds % 1000) * 1000000L,
    };
    while (nanosleep(&duration, &duration) != 0 && errno == EINTR) {
    }
}

static cleanup_result clean_managed_wine_processes(
    const root_list *roots,
    pid_t owner_pid
) {
    pid_list detected = discover_managed_wine_processes(roots, owner_pid);
    signal_processes(&detected, SIGTERM);
    wait_milliseconds(GRACEFUL_WAIT_MS);

    pid_list forced = discover_managed_wine_processes(roots, owner_pid);
    signal_processes(&forced, SIGKILL);
    wait_milliseconds(FORCED_WAIT_MS);

    pid_list remaining = discover_managed_wine_processes(roots, owner_pid);
    dprintf(
        STDOUT_FILENO,
        "CLEANUP detected=%zu forced=%zu remaining=%zu\n",
        detected.count,
        forced.count,
        remaining.count
    );

    cleanup_result result = {
        .detected = detected.count,
        .forced = forced.count,
        .remaining = remaining.count,
        .result = remaining.count == 0 ? 0 : 2,
    };
    free_pids(&detected);
    free_pids(&forced);
    free_pids(&remaining);
    return result;
}

static void parse_control_bytes(
    control_parser *parser,
    const char *buffer,
    ssize_t bytes_read
) {
    for (ssize_t index = 0; index < bytes_read; index += 1) {
        const char character = buffer[index];
        if (character == '\n') {
            parser->line[parser->line_length] = '\0';
            if (strcmp(parser->line, "CLEAN") == 0
                || strcmp(parser->line, "CLEAN\r") == 0) {
                parser->clean_shutdown = true;
            }
            parser->line_length = 0;
            continue;
        }

        if (parser->line_length + 1 < sizeof(parser->line)) {
            parser->line[parser->line_length] = character;
            parser->line_length += 1;
        }
    }
}

static bool control_parser_has_clean_shutdown(control_parser *parser) {
    if (parser->line_length > 0) {
        parser->line[parser->line_length] = '\0';
        if (strcmp(parser->line, "CLEAN") == 0
            || strcmp(parser->line, "CLEAN\r") == 0) {
            parser->clean_shutdown = true;
        }
    }

    return parser->clean_shutdown;
}

static bool initialize_guardian_monitor(
    pid_t owner_pid,
    guardian_monitor *monitor
) {
    monitor->queue_fd = kqueue();
    monitor->owner_exited = false;
    if (monitor->queue_fd < 0) {
        return false;
    }

    struct kevent control_change;
    EV_SET(
        &control_change,
        (uintptr_t)STDIN_FILENO,
        EVFILT_READ,
        EV_ADD | EV_ENABLE,
        0,
        0,
        NULL
    );
    if (kevent(monitor->queue_fd, &control_change, 1, NULL, 0, NULL) != 0) {
        close(monitor->queue_fd);
        monitor->queue_fd = -1;
        return false;
    }

    struct kevent owner_change;
    EV_SET(
        &owner_change,
        (uintptr_t)owner_pid,
        EVFILT_PROC,
        EV_ADD | EV_ENABLE,
        NOTE_EXIT,
        0,
        NULL
    );
    if (kevent(monitor->queue_fd, &owner_change, 1, NULL, 0, NULL) != 0) {
        if (errno == ESRCH) {
            monitor->owner_exited = true;
            return true;
        }
        close(monitor->queue_fd);
        monitor->queue_fd = -1;
        return false;
    }

    return true;
}

static guardian_trigger wait_for_shutdown_trigger(
    guardian_monitor *monitor
) {
    if (monitor->owner_exited) {
        return GUARDIAN_TRIGGER_OWNER_EXIT;
    }

    control_parser parser = {0};
    while (true) {
        if (termination_signal != 0) {
            return trigger_for_signal(termination_signal);
        }

        struct kevent event;
        const int event_count = kevent(
            monitor->queue_fd,
            NULL,
            0,
            &event,
            1,
            NULL
        );
        if (event_count < 0) {
            if (errno == EINTR) {
                continue;
            }
            return GUARDIAN_TRIGGER_MONITOR_ERROR;
        }
        if (event_count == 0) {
            continue;
        }
        if ((event.flags & EV_ERROR) != 0) {
            return GUARDIAN_TRIGGER_MONITOR_ERROR;
        }
        if (event.filter == EVFILT_PROC
            && (event.fflags & NOTE_EXIT) != 0) {
            return GUARDIAN_TRIGGER_OWNER_EXIT;
        }
        if (event.filter != EVFILT_READ
            || event.ident != (uintptr_t)STDIN_FILENO) {
            continue;
        }

        char buffer[256];
        const ssize_t bytes_read = read(STDIN_FILENO, buffer, sizeof(buffer));
        if (bytes_read > 0) {
            parse_control_bytes(&parser, buffer, bytes_read);
        } else if (bytes_read < 0 && errno != EINTR) {
            return GUARDIAN_TRIGGER_MONITOR_ERROR;
        }

        if (bytes_read == 0 || (event.flags & EV_EOF) != 0) {
            return control_parser_has_clean_shutdown(&parser)
                ? GUARDIAN_TRIGGER_CLEAN
                : GUARDIAN_TRIGGER_CONTROL_EOF;
        }
    }
}

static void print_usage(const char *program_name) {
    fprintf(
        stderr,
        "Usage: %s --owner-pid <pid> --root <path> [--root <path> ...]"
        " [--event-log <path>]\n",
        program_name
    );
}

int main(int argc, char **argv) {
    signal(SIGPIPE, SIG_IGN);
    if (!install_termination_signal_handlers()) {
        fprintf(stderr, "failed to install Guardian signal handlers: %s\n", strerror(errno));
        return 70;
    }

    root_list roots = {0};
    pid_t owner_pid = 0;
    char *event_log_path = NULL;

    for (int index = 1; index < argc; index += 1) {
        if (strcmp(argv[index], "--owner-pid") == 0 && index + 1 < argc) {
            errno = 0;
            char *pid_end = NULL;
            const long parsed_pid = strtol(argv[++index], &pid_end, 10);
            if (errno != 0 || pid_end == argv[index] || *pid_end != '\0'
                || parsed_pid <= 1 || parsed_pid > INT_MAX) {
                print_usage(argv[0]);
                free_roots(&roots);
                free(event_log_path);
                return 64;
            }
            owner_pid = (pid_t)parsed_pid;
            continue;
        }

        if (strcmp(argv[index], "--root") == 0
            && index + 1 < argc
            && roots.count < MAX_MANAGED_ROOTS) {
            char *root = normalize_root(argv[++index]);
            if (root == NULL || strcmp(root, "/") == 0) {
                free(root);
                free_roots(&roots);
                free(event_log_path);
                return 64;
            }
            roots.items[roots.count] = root;
            roots.count += 1;
            continue;
        }

        if (strcmp(argv[index], "--event-log") == 0 && index + 1 < argc) {
            free(event_log_path);
            event_log_path = strdup(argv[++index]);
            if (event_log_path == NULL) {
                free_roots(&roots);
                return 70;
            }
            continue;
        }

        print_usage(argv[0]);
        free_roots(&roots);
        free(event_log_path);
        return 64;
    }

    if (owner_pid <= 1 || roots.count == 0) {
        print_usage(argv[0]);
        free_roots(&roots);
        free(event_log_path);
        return 64;
    }

    guardian_monitor monitor;
    if (!initialize_guardian_monitor(owner_pid, &monitor)) {
        fprintf(stderr, "failed to initialize Guardian process monitor: %s\n", strerror(errno));
        free_roots(&roots);
        free(event_log_path);
        return 70;
    }

    const int event_log_fd = open_event_log(event_log_path);
    if (event_log_path != NULL && event_log_fd < 0) {
        fprintf(stderr, "failed to open Guardian event log: %s\n", strerror(errno));
    }

    dprintf(STDOUT_FILENO, "READY pid=%d roots=%zu\n", getpid(), roots.count);
    char ready_event[128];
    snprintf(
        ready_event,
        sizeof(ready_event),
        "event=ready ownerPid=%d roots=%zu",
        owner_pid,
        roots.count
    );
    write_guardian_event(event_log_fd, ready_event);

    const guardian_trigger trigger = wait_for_shutdown_trigger(&monitor);
    int result = 0;
    if (trigger == GUARDIAN_TRIGGER_CLEAN) {
        write_guardian_event(event_log_fd, "event=stop trigger=clean");
    } else {
        const cleanup_result cleanup = clean_managed_wine_processes(&roots, owner_pid);
        char cleanup_event[256];
        snprintf(
            cleanup_event,
            sizeof(cleanup_event),
            "event=cleanup trigger=%s detected=%zu forced=%zu remaining=%zu result=%d",
            trigger_name(trigger),
            cleanup.detected,
            cleanup.forced,
            cleanup.remaining,
            cleanup.result
        );
        write_guardian_event(event_log_fd, cleanup_event);
        result = cleanup.result;
    }

    close(monitor.queue_fd);
    if (event_log_fd >= 0) {
        close(event_log_fd);
    }
    free_roots(&roots);
    free(event_log_path);
    return result;
}
