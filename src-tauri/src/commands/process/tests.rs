use super::*;
use tempfile::NamedTempFile;
use std::io::Write;



    #[test]
    fn test_parse_ffmpeg_time_standard_format() {
        let line = "frame=  123 fps= 30 q=28.0 size=    1024kB time=00:01:30.50 bitrate= 139.2kbits/s";
        let time = parse_ffmpeg_time(line).unwrap();
        assert!((time - 90.5).abs() < 0.001);
    }

    #[test]
    fn test_parse_ffmpeg_time_with_hours() {
        let line = "time=01:30:45.25";
        let time = parse_ffmpeg_time(line).unwrap();
        assert!((time - 5445.25).abs() < 0.001);
    }

    #[test]
    fn test_parse_ffmpeg_time_without_decimal() {
        let line = "time=00:00:30";
        let time = parse_ffmpeg_time(line).unwrap();
        assert_eq!(time, 30.0);
    }

    #[test]
    fn test_parse_ffmpeg_time_zero_time() {
        let line = "time=00:00:00.00";
        let time = parse_ffmpeg_time(line).unwrap();
        assert_eq!(time, 0.0);
    }

    #[test]
    fn test_parse_ffmpeg_time_invalid_format() {
        let line = "invalid line without time";
        assert!(parse_ffmpeg_time(line).is_none());
    }

    #[test]
    fn test_calculate_progress_percentage_normal() {
        let percent = calculate_progress_percentage(30.0, 100.0);
        assert_eq!(percent, 30.0);
    }

    #[test]
    fn test_calculate_progress_percentage_zero_duration() {
        let percent = calculate_progress_percentage(50.0, 0.0);
        assert_eq!(percent, 0.0);
    }

    #[test]
    fn test_calculate_progress_percentage_exceeds_100() {
        let percent = calculate_progress_percentage(120.0, 100.0);
        assert_eq!(percent, 100.0);
    }

    #[test]
    fn test_calculate_progress_percentage_at_duration() {
        let percent = calculate_progress_percentage(100.0, 100.0);
        assert_eq!(percent, 100.0);
    }

    #[test]
    fn test_validate_inputs_with_nonexistent_input_file() {
        let params = ProcessVideoParams {
                    input_file: "/nonexistent/path.mp4".to_string(),
                    output_file: "/output/file.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Input file does not exist");
    }

    #[test]
    fn test_validate_inputs_with_invalid_output_extension() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let params = ProcessVideoParams {
                    input_file: input.path().to_str().unwrap().to_string(),
                    output_file: "/output/file.txt".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid output extension"));
    }

    #[test]
    fn test_validate_inputs_with_valid_extensions() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let extensions = ["mp4", "avi", "mov", "mkv", "webm"];

        for ext in extensions {
            let params = ProcessVideoParams {
                        input_file: input.path().to_str().unwrap().to_string(),
                        output_file: format!("/output/file.{}", ext),
                        start_time: None,
                        end_time: None,
                        subtitle_file: None,
                        subtitle_font: None,
                        subtitle_font_size: None,
                        brightness: None,
                        crop_width: None,
                        crop_height: None,
                        crop_x: None,
                        crop_y: None,
                        quality_mode: None,
                        crf: None,
                    };

            assert!(validate_inputs(&params).is_ok());
        }
    }

    #[test]
    fn test_validate_inputs_with_missing_subtitle_file() {
        let mut input = NamedTempFile::new().unwrap();
        writeln!(input, "test data").unwrap();

        let params = ProcessVideoParams {
                    input_file: input.path().to_str().unwrap().to_string(),
                    output_file: "/output/file.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/nonexistent/subtitle.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let result = validate_inputs(&params);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Subtitle file does not exist");
    }

    #[test]
    fn test_build_ffmpeg_args_basic() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        // Default mode with no filters = copy mode
        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
        assert!(!args.contains(&"-crf".to_string()));
        assert!(args.contains(&"-y".to_string()));
        assert_eq!(args.last().unwrap(), "/output/video.mp4");
    }

    #[test]
    fn test_build_ffmpeg_args_with_trim() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: Some(10.5),
                    end_time: Some(60.0),
                    subtitle_file: None,
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: Some("reencode".to_string()),
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let ss_idx = args.iter().position(|x| x == "-ss").unwrap();
        let to_idx = args.iter().position(|x| x == "-to").unwrap();

        assert_eq!(args[ss_idx + 1], "10.5");
        assert_eq!(args[to_idx + 1], "60");
    }

    #[test]
    fn test_build_ffmpeg_args_with_windows_path_escaping() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("C:\\Users\\Name\\subtitles.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];

        // Should escape drive-letter colon and wrap as filename=
        assert!(filter.starts_with("subtitles=filename='"));
        assert!(filter.contains("C\\:/Users/Name/subtitles.srt"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitles() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/subtitle.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-vf".to_string()));
        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.starts_with("subtitles=filename='"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_spaces_and_quotes() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("D:\\My Subs\\O'Connor\\show.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert_eq!(
            filter,
            "subtitles=filename='D\\:/My Subs/O\\'Connor/show.srt'"
        );
    }

    #[test]
    fn test_build_ffmpeg_args_with_unc_subtitle_path() {
        // UNC paths (\\server\share\...) must not be blanket-converted to //server/share/...
        // because ffmpeg's lavf may interpret a leading // as a protocol specifier. The leading
        // \\ is preserved as an escaped literal; trailing backslashes are normalised to /.
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some(r"\\NAS\media\subs\movie.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert_eq!(
            filter,
            r"subtitles=filename='\\\\NAS/media/subs/movie.srt'"
        );
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_force_style() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("Arial".to_string()),
                    subtitle_font_size: Some(36),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("subtitles=filename='/path/to/sub.srt'"));
        assert!(filter.contains(":force_style='FontName=Arial,FontSize=36'"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_font_only() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("DejaVu Sans".to_string()),
                    subtitle_font_size: None,
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontName=DejaVu Sans'"));
        assert!(!filter.contains("FontSize"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_subtitle_font_size_only() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: None,
                    subtitle_font_size: Some(48),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontSize=48'"));
        assert!(!filter.contains("FontName"));
    }

    #[test]
    fn test_build_ffmpeg_args_with_empty_font_name_ignored() {
        let params = ProcessVideoParams {
                    input_file: "/input/video.mp4".to_string(),
                    output_file: "/output/video.mp4".to_string(),
                    start_time: None,
                    end_time: None,
                    subtitle_file: Some("/path/to/sub.srt".to_string()),
                    subtitle_font: Some("".to_string()),
                    subtitle_font_size: Some(24),
                    brightness: None,
                    crop_width: None,
                    crop_height: None,
                    crop_x: None,
                    crop_y: None,
                    quality_mode: None,
                    crf: None,
                };

        let args = build_ffmpeg_args(&params).unwrap();

        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        let filter = &args[vf_idx + 1];
        assert!(filter.contains("force_style='FontSize=24'"));
        assert!(!filter.contains("FontName="));
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_no_filters() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
        assert!(!args.contains(&"-crf".to_string()));
        assert!(!args.contains(&"-vf".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_with_filters_fallback() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(0.5),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"-crf".to_string()));
        assert!(args.contains(&"8".to_string()));
        assert!(!args.contains(&"copy".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_reencode_mode_default_crf() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("reencode".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "8");
        assert!(args.contains(&"libx264".to_string()));
        assert!(args.contains(&"aac".to_string()));
    }

    #[test]
    fn test_build_ffmpeg_args_reencode_mode_custom_crf() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("reencode".to_string()),
            crf: Some(23),
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "23");
    }

    #[test]
    fn test_build_ffmpeg_args_copy_mode_fast_seek() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: Some(10.0),
            end_time: Some(60.0),
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: Some("copy".to_string()),
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        let ss_idx = args.iter().position(|x| x == "-ss").unwrap();
        let i_idx = args.iter().position(|x| x == "-i").unwrap();
        assert!(ss_idx < i_idx, "-ss should appear before -i in copy mode");

        let t_idx = args.iter().position(|x| x == "-t");
        assert!(t_idx.is_some(), "-t (duration) should be present in copy mode");
        assert_eq!(args[t_idx.unwrap() + 1], "50");

        assert!(!args.contains(&"-to".to_string()), "-to should not be used in copy mode");
    }

    #[test]
    fn test_default_mode_no_filters_uses_copy() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: None,
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"-c".to_string()));
        assert!(args.contains(&"copy".to_string()));
        assert!(!args.contains(&"libx264".to_string()));
    }

    #[test]
    fn test_default_mode_with_filters_uses_reencode() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(0.5),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();

        assert!(args.contains(&"libx264".to_string()));
        let crf_idx = args.iter().position(|x| x == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "8");
    }

    #[test]
    fn test_normalize_brightness_percent_scale() {
        assert!((normalize_brightness(50.0) - 0.5).abs() < 1e-9);
        assert!((normalize_brightness(-100.0) - (-1.0)).abs() < 1e-9);
        assert!((normalize_brightness(100.0) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn test_escape_subtitle_path_drive_and_spaces() {
        // Drive letter colon escaped for lavfi; Windows backslashes become forward slashes.
        let escaped = escape_subtitle_path(r"C:\Users\Name\My Subs\show.srt");
        assert_eq!(escaped, r"C\:/Users/Name/My Subs/show.srt");
    }

    #[test]
    fn test_escape_subtitle_path_unc() {
        let escaped = escape_subtitle_path(r"\\NAS\media\subs\movie.srt");
        assert_eq!(escaped, r"\\\\NAS/media/subs/movie.srt");
    }

    #[test]
    fn test_normalize_brightness_already_unit_range() {
        assert!((normalize_brightness(0.5) - 0.5).abs() < 1e-9);
        assert!((normalize_brightness(-0.25) - (-0.25)).abs() < 1e-9);
    }

    #[test]
    fn test_build_ffmpeg_args_brightness_percent_normalized() {
        let params = ProcessVideoParams {
            input_file: "/input/video.mp4".to_string(),
            output_file: "/output/video.mp4".to_string(),
            start_time: None,
            end_time: None,
            subtitle_file: None,
            subtitle_font: None,
            subtitle_font_size: None,
            brightness: Some(50.0),
            crop_width: None,
            crop_height: None,
            crop_x: None,
            crop_y: None,
            quality_mode: None,
            crf: None,
        };

        let args = build_ffmpeg_args(&params).unwrap();
        let vf_idx = args.iter().position(|x| x == "-vf").unwrap();
        assert!(args[vf_idx + 1].contains("eq=brightness=0.5"));
    }

    // Regression guard for the LazyLock regex cache fix (hard-reset vector #1). If a future
    // change re-introduces per-call `Regex::new` inside `parse_ffmpeg_time`, this test will
    // fail because compiling a regex 100 000 times is orders of magnitude slower than matching
    // against a cached one. Marked `#[ignore]` so it doesn't run in the normal `cargo test`
    // suite (timing-based tests are flaky on shared CI runners); run explicitly with
    // `cargo test -- --ignored parse_ffmpeg_time_regression`.
    //
    // The budget is generous (2 s for 100k calls on one line) to avoid false failures on slow
    // machines, while still catching the ~50×+ regression from recompiling per call.
    #[test]
    #[ignore]
    fn test_parse_ffmpeg_time_regex_cache_regression() {
        use std::time::Instant;
        let line = "frame=  123 fps= 30 q=28.0 size=    1024kB time=00:01:30.50 bitrate= 139.2kbits/s";

        // Warm the LazyLock so the first call's compile cost isn't measured.
        let _ = parse_ffmpeg_time(line);

        let start = Instant::now();
        for _ in 0..100_000 {
            let _ = parse_ffmpeg_time(line);
        }
        let elapsed = start.elapsed();

        assert!(
            elapsed.as_secs() < 2,
            "parse_ffmpeg_time took {:?} for 100k calls — regex is likely being recompiled \
             per call instead of served from the LazyLock cache. Expected <2s with caching.",
            elapsed
        );
    }
